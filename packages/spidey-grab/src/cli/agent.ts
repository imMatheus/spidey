import { spawn } from "node:child_process";
import { jobStore } from "./jobs";
import { buildPrompt } from "./prompt";
import { diffs } from "./diffs";
import { history } from "./history";
import type { CreateJobRequest, FileDiff, JobDiffBundle, JobStatus } from "../protocol";

export function runJob(req: CreateJobRequest, opts: { cwd: string; claudeBin: string }): string {
  const rec = jobStore.create();
  const prompt = buildPrompt(req);
  diffs.init(rec.jobId, opts.cwd);

  // If this is a continuation, resume the parent's claude session.
  let resumeSessionId: string | null = null;
  if (req.parentJobId) {
    const parent = history.read(opts.cwd, req.parentJobId);
    if (parent?.sessionId) {
      resumeSessionId = parent.sessionId;
    }
  }

  const args: string[] = [];
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  }
  args.push(
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
  );

  const child = spawn(opts.claudeBin, args, {
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
        const step = describeEvent(event);
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
    finalize(rec.jobId, "failed", `failed to spawn claude: ${err.message}`, opts.cwd, req, rec.createdAt, sessionId);
  });

  child.on("close", (code) => {
    if (resultIsError) {
      finalize(
        rec.jobId,
        "failed",
        resultText || stderrBuffer.trim() || "claude reported an error",
        opts.cwd,
        req,
        rec.createdAt,
        sessionId,
      );
      return;
    }
    if (code === 0) {
      finalize(rec.jobId, "done", undefined, opts.cwd, req, rec.createdAt, sessionId);
    } else {
      const errMsg = stderrBuffer.trim() || `claude exited with code ${code}`;
      finalize(rec.jobId, "failed", errMsg, opts.cwd, req, rec.createdAt, sessionId);
    }
  });

  return rec.jobId;
}

function finalize(
  jobId: string,
  status: JobStatus,
  error: string | undefined,
  cwd: string,
  req: CreateJobRequest,
  createdAt: number,
  sessionId: string | null,
) {
  let fileDiffs: FileDiff[];
  try {
    fileDiffs = diffs.finalize(jobId);
  } catch {
    fileDiffs = [];
  }

  const additions = fileDiffs.reduce((n, d) => n + d.additions, 0);
  const deletions = fileDiffs.reduce((n, d) => n + d.deletions, 0);
  const promptPreview = req.prompt.length > 120 ? req.prompt.slice(0, 117) + "…" : req.prompt;

  const ctx = req.context;
  const target = {
    tagName: ctx?.tagName ?? "",
    displayName: ctx?.displayName ?? null,
    source: req.source ?? null,
  };

  const bundle: JobDiffBundle = {
    jobId,
    createdAt,
    completedAt: Date.now(),
    status,
    promptPreview,
    prompt: req.prompt,
    target,
    filesChanged: fileDiffs.length,
    additions,
    deletions,
    error,
    diffs: fileDiffs,
    parentJobId: req.parentJobId,
    sessionId: sessionId ?? undefined,
  };

  try {
    history.write(cwd, bundle);
  } catch (err) {
    console.error("[spidey-grab] failed to persist history", err);
  }

  jobStore.finish(jobId, status, error);
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
  if (event.type === "system" && typeof event.session_id === "string") return event.session_id;
  return null;
}

function describeEvent(event: any): string | null {
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

  if (event.type === "user" && event.message?.content) {
    const content = event.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "tool_result") {
          return null;
        }
      }
    }
  }

  if (event.type === "result") {
    return null;
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
