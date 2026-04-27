/**
 * Run both processes the viewer needs in dev:
 *   1) the CLI's view-server (provides /spidey-projects*.json + the autosave
 *      PUT endpoint) backed by both example spidey.json files
 *   2) `vite dev` for the viewer app, which proxies the data endpoints to
 *      (1) and gives HMR
 *
 * Either side exiting takes the other down so the terminal isn't left with
 * a zombie. Ctrl-C cleans up both.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKEND_PORT = process.env.SPIDEY_BACKEND_PORT ?? "4321";
const VIEWER_PORT = process.env.SPIDEY_VIEWER_PORT ?? "5800";

const procs: ChildProcess[] = [];

function start(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env, FORCE_COLOR: "1" },
  });
  child.on("exit", (code) => {
    console.log(`\n[${name}] exited (${code}); shutting down peer`);
    shutdown();
  });
  procs.push(child);
  return child;
}

function shutdown() {
  for (const p of procs) {
    if (!p.killed) p.kill("SIGINT");
  }
  setTimeout(() => process.exit(0), 250).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Backend — the CLI view-server, no auto-open (vite owns the browser)
start(
  "backend",
  "bun",
  [
    "packages/cli/src/index.ts",
    "view",
    "examples/next-app/spidey.json",
    "examples/vite-app/spidey.json",
    "examples/complex-app/spidey.json",
    "--port",
    BACKEND_PORT,
    "--no-open",
  ],
  ROOT,
);

// Frontend — vite dev with HMR. Pass the backend URL through env so
// vite.config.ts wires up the right proxy.
start(
  "vite",
  "bun",
  ["run", "dev", "--", "--port", VIEWER_PORT, "--open"],
  path.join(ROOT, "packages/viewer"),
  { SPIDEY_BACKEND: `http://localhost:${BACKEND_PORT}` },
);

console.log(
  `\nspidey dev: viewer http://localhost:${VIEWER_PORT}  (backend :${BACKEND_PORT})\n`,
);
