import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { createTwoFilesPatch } from "diff";
import type { FileDiff } from "../protocol";

const FILE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
// Per-side cap on stored content. Keeps bundle JSONs reasonable while still
// covering virtually every source file in a typical React project.
const MAX_STORED_CONTENT = 256 * 1024;

interface Snapshot {
  before: string | null; // null means file did not exist before the job
}

interface JobSnapshots {
  cwd: string;
  files: Map<string, Snapshot>;
}

const byJob = new Map<string, JobSnapshots>();

export const diffs = {
  init(jobId: string, cwd: string) {
    byJob.set(jobId, { cwd, files: new Map() });
  },

  /**
   * Called for every assistant `tool_use` block. If the tool is one that
   * mutates a file and we haven't snapshotted that file for this job yet,
   * read its current contents (or mark as "new" if it doesn't exist).
   *
   * stream-json emits the assistant message containing the tool_use block
   * BEFORE Claude actually executes the tool, so the file is still in its
   * pre-edit state when we read it here.
   */
  onToolUse(jobId: string, name: string, input: unknown) {
    const job = byJob.get(jobId);
    if (!job) return;
    if (!FILE_TOOLS.has(name)) return;

    const filePath = extractFilePath(input);
    if (!filePath) return;

    const abs = absolute(job.cwd, filePath);
    if (job.files.has(abs)) return;

    let before: string | null = null;
    try {
      if (existsSync(abs)) {
        before = readFileSync(abs, "utf8");
      }
    } catch {
      before = null;
    }
    job.files.set(abs, { before });
  },

  finalize(jobId: string): FileDiff[] {
    const job = byJob.get(jobId);
    if (!job) return [];
    byJob.delete(jobId);

    const out: FileDiff[] = [];
    for (const [absPath, snap] of job.files.entries()) {
      let after: string | null = null;
      try {
        if (existsSync(absPath)) {
          after = readFileSync(absPath, "utf8");
        }
      } catch {
        after = null;
      }

      // No-op edits (file declared but content identical) — skip.
      if (snap.before === after) continue;

      const rel = relative(job.cwd, absPath);
      const beforeText = snap.before ?? "";
      const afterText = after ?? "";
      const patch = createTwoFilesPatch(rel, rel, beforeText, afterText, "", "", { context: 3 });
      const { additions, deletions } = countLines(patch);
      out.push({
        file: rel,
        patch,
        additions,
        deletions,
        isNew: snap.before === null && after !== null,
        isDeleted: snap.before !== null && after === null,
        before: snap.before === null
          ? null
          : snap.before.length <= MAX_STORED_CONTENT
            ? snap.before
            : null,
        after: after === null
          ? null
          : after.length <= MAX_STORED_CONTENT
            ? after
            : null,
      });
    }
    return out;
  },

  drop(jobId: string) {
    byJob.delete(jobId);
  },
};

function extractFilePath(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const candidate = obj.file_path ?? obj.notebook_path ?? obj.path;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function absolute(cwd: string, p: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function relative(cwd: string, abs: string): string {
  if (abs.startsWith(cwd + "/") || abs.startsWith(cwd + "\\")) {
    return abs.slice(cwd.length + 1);
  }
  return abs;
}

function countLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}
