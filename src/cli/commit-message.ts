import { spawn } from "node:child_process";
import type { FileDiff, JobDiffBundle } from "../protocol";

export interface GenerateOptions {
  cwd: string;
  claudeBin: string;
  timeoutMs?: number;
}

export interface GenerateResult {
  message: string;
  fallback: boolean;
  error?: string;
}

const MAX_PATCH_CHARS_PER_FILE = 1500;
const MAX_TOTAL_PATCH_CHARS = 8000;

/** Asks Claude to write a git commit message for the given changes. Falls back
 *  to `fallbackMessage` if Claude is unavailable, errors, or returns empty. */
export async function generateCommitMessage(
  opts: GenerateOptions,
  thread: { entries: JobDiffBundle[] },
  changes: FileDiff[],
  fallbackMessage: string,
): Promise<GenerateResult> {
  if (changes.length === 0) {
    return { message: fallbackMessage, fallback: true, error: "no changes" };
  }

  const prompt = buildPrompt(thread, changes);

  return new Promise<GenerateResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (val: GenerateResult) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    const child = spawn(
      opts.claudeBin,
      ["-p", prompt, "--permission-mode", "plan"],
      {
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      },
    );

    child.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", (err) => {
      settle({
        message: fallbackMessage,
        fallback: true,
        error: `claude failed to spawn: ${err.message}`,
      });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        settle({
          message: fallbackMessage,
          fallback: true,
          error: stderr.trim() || `claude exited with code ${code}`,
        });
        return;
      }
      const cleaned = cleanMessage(stdout);
      if (!cleaned) {
        settle({
          message: fallbackMessage,
          fallback: true,
          error: "claude returned empty message",
        });
        return;
      }
      settle({ message: cleaned, fallback: false });
    });

    const timeoutMs = opts.timeoutMs ?? 30_000;
    const timer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill();
      } catch {
        // ignore
      }
      settle({
        message: fallbackMessage,
        fallback: true,
        error: `timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
    child.on("close", () => clearTimeout(timer));
  });
}

function buildPrompt(thread: { entries: JobDiffBundle[] }, changes: FileDiff[]): string {
  const root = thread.entries[0];
  const userPrompts = thread.entries
    .map((e, i) => `${i + 1}. ${e.prompt.trim()}`)
    .join("\n");

  let total = 0;
  const patchLines: string[] = [];
  for (const file of changes) {
    const tag = file.isNew ? " (new)" : file.isDeleted ? " (deleted)" : "";
    patchLines.push(`### ${file.file}${tag}`);
    let body = file.patch;
    if (body.length > MAX_PATCH_CHARS_PER_FILE) {
      body = body.slice(0, MAX_PATCH_CHARS_PER_FILE) + "\n…[truncated]";
    }
    if (total + body.length > MAX_TOTAL_PATCH_CHARS) {
      const remaining = Math.max(0, MAX_TOTAL_PATCH_CHARS - total);
      if (remaining > 0) {
        patchLines.push(body.slice(0, remaining) + "\n…[truncated]");
        total += remaining;
      }
      patchLines.push(`…[${changes.length - patchLines.length} more files omitted]`);
      break;
    }
    patchLines.push(body);
    total += body.length;
  }

  return [
    "You are writing a single git commit message that summarises the diff below.",
    "",
    "Rules:",
    "- First line: imperative subject under 72 characters, no trailing period.",
    "- If a body adds value, leave a blank line then 1-3 sentences explaining what changed and why.",
    "- Do not mention yourself, the AI, the prompt, or 'spidey-grab'.",
    "- Do not wrap the message in quotes, code fences, or any commentary. Output only the message.",
    "",
    `Original prompts driving these changes (most recent last):`,
    userPrompts,
    "",
    `Changed files (${changes.length}):`,
    changes.map((c) => `- ${c.file} (+${c.additions} −${c.deletions})`).join("\n"),
    "",
    "Unified diff:",
    patchLines.join("\n"),
  ].join("\n");
}

function cleanMessage(raw: string): string {
  let s = raw.trim();
  // Strip code fences
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  // Strip surrounding quotes
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  // Drop a leading "Subject:" or "Commit message:" preamble line if present
  s = s.replace(/^(subject|commit message)\s*:\s*/i, "");
  return s;
}
