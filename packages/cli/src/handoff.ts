import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type AgentName = "claude" | "codex";

export type Job = {
  id: string;
  projectId: string;
  agent: AgentName;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  status: "running" | "done" | "error";
  errorMessage?: string;
  /** Last RING_BYTES of merged stdout+stderr, kept in memory for fast polls. */
  logTail: string;
  /** On-disk path of the full log; useful for post-mortems. */
  logPath: string;
};

const RING_BYTES = 8 * 1024;
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour after completion

type Internal = Job & { child?: ChildProcess; gcAt?: number };

const jobs = new Map<string, Internal>();
const activeByProject = new Map<string, string>();

export class HandoffError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
  }
}

/** Throws HandoffError(422) when the requested agent isn't on PATH. */
function resolveBin(agent: AgentName): string {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [agent], {
    encoding: "utf8",
  });
  const out = (probe.stdout ?? "").trim().split(/\r?\n/)[0]?.trim();
  if (!out || probe.status !== 0) {
    const hint =
      agent === "claude"
        ? "Install Claude Code: https://docs.claude.com/claude-code"
        : "Install Codex CLI: https://github.com/openai/codex";
    throw new HandoffError(
      `'${agent}' not found on PATH. ${hint}`,
      422,
    );
  }
  return out;
}

function newJobId(): string {
  return "u-" + crypto.randomUUID().slice(0, 8);
}

function gcExpired(): void {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.gcAt && j.gcAt <= now) {
      jobs.delete(id);
    }
  }
}

export function getJob(jobId: string): Job | null {
  gcExpired();
  const j = jobs.get(jobId);
  if (!j) return null;
  return toPublic(j);
}

export function getProjectActiveJob(projectId: string): Job | null {
  gcExpired();
  const id = activeByProject.get(projectId);
  if (!id) return null;
  const j = jobs.get(id);
  if (!j || j.status !== "running") return null;
  return toPublic(j);
}

function toPublic(j: Internal): Job {
  // Strip the live ChildProcess handle / gc timestamp from the public view.
  const { child: _c, gcAt: _g, ...pub } = j;
  return pub;
}

/**
 * Strip ANSI escape sequences and stray C0 control bytes from a chunk
 * before we serialize it on the wire. Both `claude` and `codex` emit color
 * codes by default; without this they end up as raw 0x1B bytes inside
 * `logTail`, which JSON.stringify allows but some HTTP middleware /
 * pretty-printers reject. The full on-disk log keeps the raw output.
 *
 * Built with String.fromCharCode + RegExp(...) so the source file is plain
 * ASCII and survives copy-paste / editors that strip control characters.
 */
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
// CSI: ESC [ params? intermediates? final-byte
const RE_CSI = new RegExp(ESC + "\\[[0-?]*[ -/]*[@-~]", "g");
// OSC: ESC ] payload (BEL | ESC \)
const RE_OSC = new RegExp(
  ESC + "\\][^" + ESC + BEL + "]*(?:" + BEL + "|" + ESC + "\\\\)",
  "g",
);
// Misc 2-char: ESC + 0x40..0x5F (covers ESC =, ESC >, etc.)
const RE_ESC_PAIR = new RegExp(ESC + "[@-_]", "g");
// Lone C0 control bytes except tab (0x09) / LF (0x0A) / CR (0x0D).
const RE_C0 = new RegExp(
  "[" +
    "\\u0000-\\u0008" +
    "\\u000b-\\u000c" +
    "\\u000e-\\u001f" +
    "]",
  "g",
);

function sanitize(s: string): string {
  return s
    .replace(RE_CSI, "")
    .replace(RE_OSC, "")
    .replace(RE_ESC_PAIR, "")
    .replace(RE_C0, "");
}

export function startJob(opts: {
  projectId: string;
  agent: AgentName;
  prompt: string;
  /** Working directory for the child — typically the captured project root. */
  cwd: string;
  /** Where to put the .spidey/handoff-<id>.log file. Typically the directory
   *  holding spidey.json (next to .spidey/baseline.json). */
  logDir: string;
}): Job {
  if (activeByProject.has(opts.projectId)) {
    const existing = jobs.get(activeByProject.get(opts.projectId)!);
    if (existing && existing.status === "running") {
      throw new HandoffError(
        `another ${existing.agent} job is already running for this project`,
        409,
      );
    }
  }

  const bin = resolveBin(opts.agent);

  const id = newJobId();
  const logDir = path.resolve(opts.logDir, ".spidey");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `handoff-${id}.log`);
  const logFile = fs.createWriteStream(logPath, { flags: "w" });

  const args =
    opts.agent === "claude"
      ? ["-p", opts.prompt]
      : ["exec", opts.prompt];

  let child: ChildProcess;
  try {
    child = spawn(bin, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e: any) {
    logFile.end();
    throw new HandoffError(`failed to spawn ${opts.agent}: ${e?.message ?? e}`, 500);
  }

  const job: Internal = {
    id,
    projectId: opts.projectId,
    agent: opts.agent,
    startedAt: Date.now(),
    status: "running",
    logTail: "",
    logPath,
    child,
  };
  jobs.set(id, job);
  activeByProject.set(opts.projectId, id);

  const ring = { buf: "" };
  const append = (chunk: Buffer | string) => {
    const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    logFile.write(raw); // keep the on-disk log faithful to the agent's output
    const cleaned = sanitize(raw);
    ring.buf += cleaned;
    if (ring.buf.length > RING_BYTES) {
      ring.buf = ring.buf.slice(ring.buf.length - RING_BYTES);
    }
    job.logTail = ring.buf;
  };

  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  child.on("error", (err) => {
    job.status = "error";
    job.errorMessage = String(err?.message ?? err);
    job.endedAt = Date.now();
    job.gcAt = job.endedAt + JOB_TTL_MS;
    if (activeByProject.get(opts.projectId) === id) {
      activeByProject.delete(opts.projectId);
    }
    logFile.end();
  });

  child.on("exit", (code) => {
    job.exitCode = code ?? undefined;
    job.endedAt = Date.now();
    job.status = code === 0 ? "done" : "error";
    if (job.status === "error" && code != null) {
      job.errorMessage = `agent exited with code ${code}`;
    }
    job.gcAt = job.endedAt + JOB_TTL_MS;
    if (activeByProject.get(opts.projectId) === id) {
      activeByProject.delete(opts.projectId);
    }
    logFile.end();
  });

  return toPublic(job);
}
