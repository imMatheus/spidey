import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative as pathRelative, resolve } from "node:path";
import { createTwoFilesPatch } from "diff";
import type { FileDiff } from "../protocol";

const MAX_STORED_CONTENT = 256 * 1024;

interface JobSnapshot {
  cwd: string;
  /** Repo root for path resolution. Same as cwd if cwd isn't inside a repo
   *  (in which case we won't capture anything anyway). */
  toplevel: string;
  /** Pre-job content keyed by absolute path. null means the file did not
   *  exist on disk when the snapshot was taken. */
  dirtyBefore: Map<string, string | null>;
}

const byJob = new Map<string, JobSnapshot>();

/**
 * Diff capture that doesn't depend on the agent emitting tool-use events.
 * At job start, snapshot the contents of every file that's currently dirty
 * (so subsequent edits can't lose the pre-job state). At finalize, scan
 * `git status --porcelain` again — for each dirty file, the "before" is
 * either our captured snapshot or HEAD's content (for files that were clean
 * when the job started). Skip files whose content didn't change.
 *
 * git status reports paths relative to the repo's toplevel, not to cwd, so
 * we resolve through the toplevel and compute cwd-relative paths only when
 * building the FileDiff (to match what the claude code path emits).
 */
export const gitSnapshot = {
  init(jobId: string, cwd: string) {
    const toplevel = repoToplevel(cwd) ?? cwd;
    const dirty = listDirty(cwd, toplevel);
    const dirtyBefore = new Map<string, string | null>();
    for (const abs of dirty) {
      dirtyBefore.set(abs, readWorkingTree(abs));
    }
    byJob.set(jobId, { cwd, toplevel, dirtyBefore });
  },

  finalize(jobId: string): FileDiff[] {
    const job = byJob.get(jobId);
    if (!job) return [];
    byJob.delete(jobId);

    const dirtyAfter = listDirty(job.cwd, job.toplevel);
    const out: FileDiff[] = [];
    for (const abs of dirtyAfter) {
      const before = job.dirtyBefore.has(abs)
        ? job.dirtyBefore.get(abs)!
        : readHead(job.toplevel, pathRelative(job.toplevel, abs));
      const after = readWorkingTree(abs);
      if (before === after) continue;

      const rel = displayPath(job.cwd, abs);
      const beforeText = before ?? "";
      const afterText = after ?? "";
      const patch = createTwoFilesPatch(rel, rel, beforeText, afterText, "", "", { context: 3 });
      const { additions, deletions } = countLines(patch);
      out.push({
        file: rel,
        patch,
        additions,
        deletions,
        isNew: before === null && after !== null,
        isDeleted: before !== null && after === null,
        before: before === null
          ? null
          : before.length <= MAX_STORED_CONTENT
            ? before
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

function repoToplevel(cwd: string): string | null {
  const res = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (res.status !== 0) return null;
  const out = (res.stdout || "").trim();
  return out || null;
}

/** Returns absolute paths of files git reports as dirty within `cwd`. Files
 *  outside `cwd` (siblings in the same repo) are filtered out so codex's
 *  diff scope matches what the user expects from "edits in this project". */
function listDirty(cwd: string, toplevel: string): string[] {
  const res = spawnSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd, encoding: "utf8" },
  );
  if (res.status !== 0) return [];
  const out = res.stdout || "";
  if (!out) return [];

  // Porcelain v1 -z layout: each entry is "XY<sp>path\0". Renames emit two
  // NUL-separated entries: "R <sp>new\0old\0" — the bare second entry has
  // no XY prefix. We treat any token < 4 chars (or with no leading XY+sp)
  // as the orig-name half of a rename and skip it.
  const tokens = out.split("\0").filter(Boolean);
  const cwdPrefix = cwd.endsWith("/") ? cwd : cwd + "/";
  const files: string[] = [];
  for (const t of tokens) {
    if (t.length < 4 || t[2] !== " ") continue;
    const rel = t.slice(3);
    if (!rel) continue;
    const abs = resolve(toplevel, rel);
    if (abs === cwd || abs.startsWith(cwdPrefix)) {
      files.push(abs);
    }
  }
  return files;
}

function readWorkingTree(abs: string): string | null {
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function readHead(toplevel: string, relFromToplevel: string): string | null {
  const res = spawnSync("git", ["show", `HEAD:${relFromToplevel}`], {
    cwd: toplevel,
    encoding: "utf8",
  });
  if (res.status !== 0) return null;
  return res.stdout ?? null;
}

function displayPath(cwd: string, abs: string): string {
  const rel = pathRelative(cwd, abs);
  return rel || abs;
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
