import { spawn } from "node:child_process";
import { jobStore } from "./jobs";
import { buildPrompt } from "./prompt";
import type { CreateJobRequest } from "../protocol";

export function runJob(req: CreateJobRequest, opts: { cwd: string; claudeBin: string }): string {
  const rec = jobStore.create();
  const prompt = buildPrompt(req);

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "acceptEdits",
  ];

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

  child.stdout!.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = stdoutBuffer.indexOf("\n")) !== -1) {
      const line = stdoutBuffer.slice(0, nl).trim();
      stdoutBuffer = stdoutBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line);
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
    jobStore.finish(rec.jobId, "failed", `failed to spawn claude: ${err.message}`);
  });

  child.on("close", (code) => {
    if (resultIsError) {
      jobStore.finish(rec.jobId, "failed", resultText || stderrBuffer.trim() || "claude reported an error");
      return;
    }
    if (code === 0) {
      jobStore.finish(rec.jobId, "done", undefined);
    } else {
      const errMsg = stderrBuffer.trim() || `claude exited with code ${code}`;
      jobStore.finish(rec.jobId, "failed", errMsg);
    }
  });

  return rec.jobId;
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
