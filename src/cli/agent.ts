import { spawn, type ChildProcess } from "node:child_process";
import { jobStore } from "./jobs";
import { buildPrompt } from "./prompt";
import { diffs } from "./diffs";
import { gitSnapshot } from "./git-snapshot";
import { history } from "./history";
import type {
  AgentKind,
  CreateJobRequest,
  FileDiff,
  JobDiffBundle,
  JobStatus,
} from "../protocol";

export interface AgentBins {
  claude: string;
  codex: string;
}

export interface RunOpts {
  cwd: string;
  bins: AgentBins;
}

export function runJob(req: CreateJobRequest, opts: RunOpts): string {
  const agent: AgentKind = req.agent === "codex" ? "codex" : "claude";
  if (agent === "codex") return runCodexJob(req, opts);
  return runClaudeJob(req, opts);
}

// ---------- Claude ----------

function runClaudeJob(req: CreateJobRequest, opts: RunOpts): string {
  const rec = jobStore.create({ prompt: req.prompt, agent: "claude" });
  const prompt = buildPrompt(req, { agent: "claude" });
  diffs.init(rec.jobId, opts.cwd);

  let resumeSessionId: string | null = null;
  if (req.parentJobId) {
    const parent = history.read(opts.cwd, req.parentJobId);
    if (parent?.sessionId) resumeSessionId = parent.sessionId;
  }

  const args: string[] = [];
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  args.push(
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
  );

  const child = spawn(opts.bins.claude, args, {
    cwd: opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  jobStore.attachChild(rec.jobId, child);

  let stdoutBuffer = "";
  let stderrBuffer = "";
  let resultText: string | null = null;
  let resultIsError = false;
  let sessionId: string | null = null;

  child.stdout!.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = stdoutBuffer.indexOf("\n")) !== -1) {
      const line = stdoutBuffer.slice(0, nl).trim();
      stdoutBuffer = stdoutBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
        captureToolUses(rec.jobId, event);
        if (sessionId === null) {
          const sid = extractSessionId(event);
          if (sid) sessionId = sid;
        }
        const step = describeClaudeEvent(event);
        if (step) jobStore.setStep(rec.jobId, step);
        if (event.type === "result") {
          resultText = typeof event.result === "string" ? event.result : null;
          resultIsError = Boolean(event.is_error || event.subtype === "error_max_turns");
        }
      } catch {
        // non-JSON line, ignore
      }
    }
  });

  child.stderr!.on("data", (chunk: Buffer) => {
    stderrBuffer += chunk.toString("utf8");
  });

  child.on("error", (err) => {
    finalize({
      jobId: rec.jobId,
      status: "failed",
      error: `failed to spawn claude: ${err.message}`,
      cwd: opts.cwd,
      req,
      createdAt: rec.createdAt,
      sessionId,
      agent: "claude",
      diffSource: "tool-use",
    });
  });

  child.on("close", (code) => {
    if (resultIsError) {
      finalize({
        jobId: rec.jobId,
        status: "failed",
        error: resultText || stderrBuffer.trim() || "claude reported an error",
        cwd: opts.cwd,
        req,
        createdAt: rec.createdAt,
        sessionId,
        agent: "claude",
        diffSource: "tool-use",
      });
      return;
    }
    if (code === 0) {
      finalize({
        jobId: rec.jobId,
        status: "done",
        cwd: opts.cwd,
        req,
        createdAt: rec.createdAt,
        sessionId,
        agent: "claude",
        diffSource: "tool-use",
      });
    } else {
      finalize({
        jobId: rec.jobId,
        status: "failed",
        error: stderrBuffer.trim() || `claude exited with code ${code}`,
        cwd: opts.cwd,
        req,
        createdAt: rec.createdAt,
        sessionId,
        agent: "claude",
        diffSource: "tool-use",
      });
    }
  });

  return rec.jobId;
}

function captureToolUses(jobId: string, event: any) {
  if (!event || event.type !== "assistant") return;
  const content = event.message?.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type === "tool_use" && typeof block.name === "string") {
      diffs.onToolUse(jobId, block.name, block.input);
    }
  }
}

function extractSessionId(event: any): string | null {
  if (!event || typeof event !== "object") return null;
  if (typeof event.session_id === "string" && event.session_id) return event.session_id;
  return null;
}

function describeClaudeEvent(event: any): string | null {
  if (!event || typeof event !== "object") return null;

  if (event.type === "system" && event.subtype === "init") {
    return "starting";
  }

  if (event.type === "assistant" && event.message?.content) {
    const content = event.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "tool_use") {
          return describeToolUse(block.name, block.input);
        }
      }
    }
    return "thinking";
  }

  return null;
}

function describeToolUse(name: string, input: any): string {
  const path = input?.file_path || input?.path || "";
  const short = path ? shortenPath(path) : "";
  switch (name) {
    case "Edit":
    case "Write":
      return short ? `editing ${short}` : "editing";
    case "Read":
      return short ? `reading ${short}` : "reading";
    case "Bash": {
      const cmd = typeof input?.command === "string" ? input.command.split(" ")[0] : "";
      return cmd ? `running ${cmd}` : "running command";
    }
    case "Glob":
    case "Grep":
      return "searching";
    case "TodoWrite":
      return "planning";
    default:
      return name.toLowerCase();
  }
}

function shortenPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
}

// ---------- Codex ----------

function runCodexJob(req: CreateJobRequest, opts: RunOpts): string {
  const rec = jobStore.create({ prompt: req.prompt, agent: "codex" });
  // For continuations, hand codex the full prior thread inline since it
  // doesn't keep state across our spawn boundary.
  const thread = req.parentJobId
    ? history.thread(opts.cwd, req.parentJobId)?.entries
    : undefined;
  const prompt = buildPrompt(req, { agent: "codex", thread });
  // codex doesn't emit tool-use events we can hook, so capture diffs by
  // diffing the working tree before/after the run.
  gitSnapshot.init(rec.jobId, opts.cwd);

  // `codex exec` is the non-interactive headless mode. We pass the prompt
  // positionally and let codex run unattended in workspace-write mode so it
  // can apply edits without prompting. SPIDEY_CODEX_ARGS lets users override
  // these flags if their codex build differs.
  const extra = process.env.SPIDEY_CODEX_ARGS
    ? process.env.SPIDEY_CODEX_ARGS.split(/\s+/).filter(Boolean)
    : ["--sandbox", "workspace-write", "--skip-git-repo-check"];
  const args = ["exec", ...extra, prompt];

  jobStore.setStep(rec.jobId, "starting codex");

  let child: ChildProcess;
  try {
    child = spawn(opts.bins.codex, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch (err) {
    finalize({
      jobId: rec.jobId,
      status: "failed",
      error: `failed to spawn codex: ${(err as Error).message}`,
      cwd: opts.cwd,
      req,
      createdAt: rec.createdAt,
      sessionId: null,
      agent: "codex",
      diffSource: "git",
    });
    return rec.jobId;
  }

  jobStore.attachChild(rec.jobId, child);

  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stdout!.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    stdoutBuffer += text;
    const lastLine = lastNonEmptyLine(text);
    if (lastLine) jobStore.setStep(rec.jobId, truncate(lastLine, 80));
  });

  child.stderr!.on("data", (chunk: Buffer) => {
    stderrBuffer += chunk.toString("utf8");
  });

  child.on("error", (err) => {
    finalize({
      jobId: rec.jobId,
      status: "failed",
      error: `failed to spawn codex: ${err.message}`,
      cwd: opts.cwd,
      req,
      createdAt: rec.createdAt,
      sessionId: null,
      agent: "codex",
      diffSource: "git",
    });
  });

  child.on("close", (code) => {
    if (code === 0) {
      finalize({
        jobId: rec.jobId,
        status: "done",
        cwd: opts.cwd,
        req,
        createdAt: rec.createdAt,
        sessionId: null,
        agent: "codex",
        diffSource: "git",
      });
    } else {
      finalize({
        jobId: rec.jobId,
        status: "failed",
        error:
          stderrBuffer.trim() ||
          lastNonEmptyLine(stdoutBuffer) ||
          `codex exited with code ${code}`,
        cwd: opts.cwd,
        req,
        createdAt: rec.createdAt,
        sessionId: null,
        agent: "codex",
        diffSource: "git",
      });
    }
  });

  return rec.jobId;
}

function lastNonEmptyLine(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t) return t;
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ---------- Shared finalize ----------

interface FinalizeArgs {
  jobId: string;
  status: JobStatus;
  error?: string;
  cwd: string;
  req: CreateJobRequest;
  createdAt: number;
  sessionId: string | null;
  agent: AgentKind;
  diffSource: "tool-use" | "git";
}

function finalize(args: FinalizeArgs) {
  let fileDiffs: FileDiff[];
  try {
    fileDiffs = args.diffSource === "tool-use"
      ? diffs.finalize(args.jobId)
      : gitSnapshot.finalize(args.jobId);
  } catch {
    fileDiffs = [];
  }

  const additions = fileDiffs.reduce((n, d) => n + d.additions, 0);
  const deletions = fileDiffs.reduce((n, d) => n + d.deletions, 0);
  const promptPreview = args.req.prompt.length > 120
    ? args.req.prompt.slice(0, 117) + "…"
    : args.req.prompt;

  const ctx = args.req.context;
  const target = {
    tagName: ctx?.tagName ?? "",
    displayName: ctx?.displayName ?? null,
    source: args.req.source ?? null,
  };

  const bundle: JobDiffBundle = {
    jobId: args.jobId,
    createdAt: args.createdAt,
    completedAt: Date.now(),
    status: args.status,
    promptPreview,
    prompt: args.req.prompt,
    target,
    filesChanged: fileDiffs.length,
    additions,
    deletions,
    error: args.error,
    diffs: fileDiffs,
    parentJobId: args.req.parentJobId,
    sessionId: args.sessionId ?? undefined,
    agent: args.agent,
  };

  try {
    history.write(args.cwd, bundle);
  } catch (err) {
    console.error("[spidey-grab] failed to persist history", err);
  }

  jobStore.finish(args.jobId, args.status, args.error);
}
