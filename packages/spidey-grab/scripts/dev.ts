/**
 * One-stop dev harness for spidey-grab. Runs three processes in parallel:
 *
 *   1) tsup --watch    → keeps dist/inject.js fresh (the IIFE bundle the CLI
 *                        serves to browsers; rebuilt on save)
 *   2) bun --watch CLI → runs src/cli/index.ts directly from source and
 *                        auto-restarts when any imported file changes
 *   3) vite dev        → the example vite-app on :5400 (its index.html already
 *                        references http://localhost:7878/spidey-grab.js)
 *
 * The IIFE bundle is read off disk on each request, so client changes show up
 * on the next browser refresh without restarting the CLI. CLI changes restart
 * the CLI itself via bun's built-in watcher.
 *
 * Any child exiting takes the others down so the terminal isn't left with
 * zombies. Ctrl-C cleans up everything.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const PKG = path.resolve(import.meta.dirname, "..");
const REPO = path.resolve(PKG, "../..");
const VITE_APP = path.join(REPO, "examples/vite-app");
const INJECT_BUNDLE = path.join(PKG, "dist/inject.js");

const procs: Bun.Subprocess[] = [];
let shuttingDown = false;

function start(name: string, cmd: string[], cwd: string, extraEnv: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
    env: { ...process.env, FORCE_COLOR: "1", ...extraEnv },
  });
  proc.exited.then((code) => {
    if (shuttingDown) return;
    console.log(`\n[${name}] exited (code=${code}); shutting down peers`);
    shutdown();
  });
  procs.push(proc);
  return proc;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    if (!p.killed) p.kill("SIGINT");
  }
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Make sure the IIFE bundle exists before the CLI starts serving — otherwise
// the very first browser request 404s until tsup finishes its first build.
if (!existsSync(INJECT_BUNDLE)) {
  console.log("[init] no dist/inject.js yet, running initial build…");
  const r = Bun.spawnSync(["bun", "run", "build"], { cwd: PKG, stdio: ["inherit", "inherit", "inherit"] });
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
}

start("tsup", ["bunx", "tsup", "--watch"], PKG);
start("cli",  ["bun", "--watch", "src/cli/index.ts", "--cwd", VITE_APP], PKG, {
  SPIDEY_GRAB_INJECT_BUNDLE: INJECT_BUNDLE,
});
start("vite", ["bun", "run", "dev"], VITE_APP);

console.log(
  `\nspidey-grab dev:` +
    `\n  CLI         http://localhost:7878/spidey-grab.js (rebuilt on save)` +
    `\n  vite-app    http://localhost:5400/` +
    `\n`,
);
