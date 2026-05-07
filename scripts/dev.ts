/**
 * One-stop dev harness for spidey-grab. Runs two processes in parallel:
 *
 *   1) tsup --watch    → keeps dist/inject.js fresh (the IIFE the daemon
 *                        serves to browsers) and rebuilds the plugins on
 *                        save so the example picks up changes via its
 *                        `file:../..` dep.
 *   2) example dev     → the chosen example app. Its bundler config uses
 *                        `spidey-grab/{vite,next}` so the daemon boots
 *                        in-process — no separate CLI subprocess needed.
 *
 * Any child exiting takes the others down so the terminal isn't left with
 * zombies. Ctrl-C cleans up everything.
 */
import { existsSync } from "node:fs";
import path from "node:path";

const PKG = path.resolve(import.meta.dirname, "..");
const EXAMPLES_DIR = path.join(PKG, "examples");
const INJECT_BUNDLE = path.join(PKG, "dist/inject.js");

const DEFAULT_EXAMPLE = "vite-app";

function parseExample(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--example" || a === "-e") return argv[++i] ?? DEFAULT_EXAMPLE;
    if (a.startsWith("--example=")) return a.slice("--example=".length);
    if (!a.startsWith("-")) return a;
  }
  return DEFAULT_EXAMPLE;
}

const exampleName = parseExample(process.argv.slice(2));
const EXAMPLE_DIR = path.join(EXAMPLES_DIR, exampleName);
if (!existsSync(path.join(EXAMPLE_DIR, "package.json"))) {
  console.error(`[dev] unknown example "${exampleName}" — no package.json at ${EXAMPLE_DIR}`);
  process.exit(1);
}

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

// Make sure the IIFE bundle exists before the example starts serving —
// otherwise the very first browser request 404s until tsup's first build.
if (!existsSync(INJECT_BUNDLE)) {
  console.log("[init] no dist/inject.js yet, running initial build…");
  const r = Bun.spawnSync(["bun", "run", "build"], { cwd: PKG, stdio: ["inherit", "inherit", "inherit"] });
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1);
}

// `tsup --watch` (no path) watches the cwd and only ignores each config's own
// outDir, which means writes to dist/cli trigger the plugin/IIFE configs to
// rebuild and vice-versa — an endless rebuild loop that truncates dist/inject.js
// mid-write and serves torn JS to the browser. Pass explicit paths to scope the
// watcher to source files only.
start("tsup", ["bunx", "tsup", "--watch", "src", "--watch", "tsup.config.ts"], PKG);
start("example", ["bun", "run", "dev"], EXAMPLE_DIR);

console.log(
  `\nspidey-grab dev:` +
    `\n  example   ${exampleName} (daemon boots in-process via the plugin)` +
    `\n`,
);
