import { spawnSync } from "node:child_process";

export interface CommitResult {
  ok: boolean;
  sha?: string;
  filesCommitted?: string[];
  nothingToCommit?: boolean;
  error?: string;
}

/** Stage the given paths and create a single commit with `message`. Only the
 *  paths listed are added — other dirty files in the repo are left untouched. */
export function commitFiles(cwd: string, files: string[], message: string): CommitResult {
  if (files.length === 0) {
    return { ok: false, error: "no files to commit" };
  }

  // make sure we're inside a git repo so failures are clear
  const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf8",
  });
  if (inside.status !== 0) {
    return { ok: false, error: `not a git repo: ${cwd}` };
  }

  // stage only the requested paths (handles add/modify/delete)
  const add = spawnSync("git", ["add", "--", ...files], { cwd, encoding: "utf8" });
  if (add.status !== 0) {
    return { ok: false, error: `git add failed: ${add.stderr.trim() || add.stdout.trim()}` };
  }

  // detect "nothing to commit" by checking the staged diff for these paths
  const diff = spawnSync("git", ["diff", "--cached", "--quiet", "--", ...files], {
    cwd,
    encoding: "utf8",
  });
  if (diff.status === 0) {
    // exit 0 = no staged changes
    return { ok: false, nothingToCommit: true };
  }

  const commit = spawnSync("git", ["commit", "-m", message, "--", ...files], {
    cwd,
    encoding: "utf8",
  });
  if (commit.status !== 0) {
    return { ok: false, error: `git commit failed: ${commit.stderr.trim() || commit.stdout.trim()}` };
  }

  const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  const sha = rev.status === 0 ? rev.stdout.trim() : undefined;

  return { ok: true, sha, filesCommitted: files };
}

export interface PushResult {
  ok: boolean;
  error?: string;
}

/** Run `git push` against the current branch's upstream. If no upstream is set,
 *  attempts `git push -u origin <branch>` to publish it. */
export function pushCurrentBranch(cwd: string): PushResult {
  const head = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" });
  if (head.status !== 0) {
    return { ok: false, error: `git rev-parse failed: ${head.stderr.trim()}` };
  }
  const branch = head.stdout.trim();
  if (!branch || branch === "HEAD") {
    return { ok: false, error: "detached HEAD — no branch to push" };
  }

  // first try a plain push (uses configured upstream)
  const push = spawnSync("git", ["push"], { cwd, encoding: "utf8" });
  if (push.status === 0) return { ok: true };

  const stderr = push.stderr.toLowerCase();
  if (stderr.includes("no upstream") || stderr.includes("has no upstream branch")) {
    const setUpstream = spawnSync("git", ["push", "-u", "origin", branch], { cwd, encoding: "utf8" });
    if (setUpstream.status === 0) return { ok: true };
    return { ok: false, error: setUpstream.stderr.trim() || setUpstream.stdout.trim() };
  }

  return { ok: false, error: push.stderr.trim() || push.stdout.trim() || "push failed" };
}
