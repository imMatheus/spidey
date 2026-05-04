import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createTwoFilesPatch } from "diff";
import type { FileDiff, JobDiffBundle, JobHistorySummary } from "../protocol";

const KEEP_LATEST = 200;
const LIST_LIMIT = 100;

function repoDir(cwd: string): string {
  const hash = createHash("sha256").update(cwd).digest("hex").slice(0, 12);
  return join(homedir(), ".spidey-grab", "history", hash);
}

function ensureDir(dir: string) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

export const history = {
  write(cwd: string, bundle: JobDiffBundle) {
    const dir = repoDir(cwd);
    ensureDir(dir);
    const path = join(dir, `${bundle.jobId}.json`);
    try {
      writeFileSync(path, JSON.stringify(bundle, null, 2));
    } catch (err) {
      console.error("[spidey-grab] failed to write history file", err);
      return;
    }
    pruneOldest(dir, KEEP_LATEST);
  },

  list(cwd: string): JobHistorySummary[] {
    const dir = repoDir(cwd);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    const summaries: JobHistorySummary[] = [];
    for (const f of files) {
      try {
        const content = readFileSync(join(dir, f), "utf8");
        const parsed = JSON.parse(content) as JobDiffBundle;
        summaries.push(stripDiffs(parsed));
      } catch {
        // skip corrupt entries
      }
    }
    summaries.sort((a, b) => b.createdAt - a.createdAt);
    return summaries.slice(0, LIST_LIMIT);
  },

  read(cwd: string, jobId: string): JobDiffBundle | null {
    const dir = repoDir(cwd);
    const path = join(dir, `${jobId}.json`);
    try {
      const content = readFileSync(path, "utf8");
      return JSON.parse(content) as JobDiffBundle;
    } catch {
      return null;
    }
  },

  /** Returns every bundle that belongs to the same parent/child chain as jobId,
   *  sorted oldest-first. Empty if jobId is not in history. */
  thread(cwd: string, jobId: string): { rootJobId: string; entries: JobDiffBundle[] } | null {
    const dir = repoDir(cwd);
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      return null;
    }
    const all: JobDiffBundle[] = [];
    for (const f of files) {
      try {
        const content = readFileSync(join(dir, f), "utf8");
        all.push(JSON.parse(content) as JobDiffBundle);
      } catch {
        // skip
      }
    }
    const byId = new Map<string, JobDiffBundle>();
    for (const b of all) byId.set(b.jobId, b);

    let cur = byId.get(jobId);
    if (!cur) return null;

    // walk up to the root
    while (cur.parentJobId) {
      const parent = byId.get(cur.parentJobId);
      if (!parent) break;
      cur = parent;
    }
    const rootJobId = cur.jobId;

    // collect all descendants (BFS)
    const collected: JobDiffBundle[] = [];
    const seen = new Set<string>();
    const queue: string[] = [rootJobId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const bundle = byId.get(id);
      if (!bundle) continue;
      collected.push(bundle);
      for (const b of all) {
        if (b.parentJobId === id && !seen.has(b.jobId)) queue.push(b.jobId);
      }
    }
    collected.sort((a, b) => a.createdAt - b.createdAt);
    return { rootJobId, entries: collected };
  },

  /** Aggregate per-file changes across the entire thread.
   *  For each file touched in any turn, computes the cumulative diff between
   *  the FIRST turn's pre-edit content and the LAST turn's post-edit content.
   *  If a bundle predates content-capture (no `before`/`after` fields), the
   *  most recent turn's per-turn patch is used verbatim as a fallback. */
  aggregateChanges(
    cwd: string,
    jobId: string,
  ): { rootJobId: string; changes: FileDiff[]; filesChanged: number; additions: number; deletions: number } | null {
    const thread = history.thread(cwd, jobId);
    if (!thread) return null;

    interface Acc {
      firstBefore: string | null;
      firstBeforeKnown: boolean;
      latestAfter: string | null;
      latestAfterKnown: boolean;
      latestPatch: FileDiff;
    }
    const byFile = new Map<string, Acc>();

    for (const entry of thread.entries) {
      for (const d of entry.diffs) {
        const cur = byFile.get(d.file);
        if (!cur) {
          byFile.set(d.file, {
            firstBefore: d.before ?? null,
            firstBeforeKnown: d.before !== undefined,
            latestAfter: d.after ?? null,
            latestAfterKnown: d.after !== undefined,
            latestPatch: d,
          });
        } else {
          cur.latestAfter = d.after ?? null;
          cur.latestAfterKnown = cur.latestAfterKnown && d.after !== undefined;
          cur.latestPatch = d;
        }
      }
    }

    const changes: FileDiff[] = [];
    let totalAdds = 0;
    let totalDels = 0;
    for (const [file, info] of byFile) {
      // Fallback: if either side wasn't captured (older bundle), surface the
      // most recent per-turn patch directly.
      if (!info.firstBeforeKnown || !info.latestAfterKnown) {
        changes.push(info.latestPatch);
        totalAdds += info.latestPatch.additions;
        totalDels += info.latestPatch.deletions;
        continue;
      }
      // Net no-op (file ended where it started)
      if (info.firstBefore === info.latestAfter) continue;

      const beforeText = info.firstBefore ?? "";
      const afterText = info.latestAfter ?? "";
      const patch = createTwoFilesPatch(file, file, beforeText, afterText, "", "", { context: 3 });
      const { additions, deletions } = countPatchLines(patch);
      const cumulative: FileDiff = {
        file,
        patch,
        additions,
        deletions,
        isNew: info.firstBefore === null && info.latestAfter !== null,
        isDeleted: info.firstBefore !== null && info.latestAfter === null,
        before: info.firstBefore,
        after: info.latestAfter,
      };
      changes.push(cumulative);
      totalAdds += additions;
      totalDels += deletions;
    }

    changes.sort((a, b) => a.file.localeCompare(b.file));
    return {
      rootJobId: thread.rootJobId,
      changes,
      filesChanged: changes.length,
      additions: totalAdds,
      deletions: totalDels,
    };
  },
};

function countPatchLines(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

function stripDiffs(bundle: JobDiffBundle): JobHistorySummary {
  // strip `prompt` and `diffs` from the summary so we don't ship them in /jobs/history
  const { prompt: _prompt, diffs: _diffs, ...summary } = bundle;
  return summary;
}

function pruneOldest(dir: string, keep: number) {
  let entries: { name: string; mtimeMs: number }[];
  try {
    entries = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs }));
  } catch {
    return;
  }
  if (entries.length <= keep) return;
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const e of entries.slice(keep)) {
    try {
      unlinkSync(join(dir, e.name));
    } catch {
      // ignore
    }
  }
}
