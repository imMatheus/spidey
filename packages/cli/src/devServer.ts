import { spawn, type ChildProcess } from "node:child_process";
import { detectPackageManager, log, sleep } from "./util.js";

export type RunningDevServer = {
  url: string;
  port: number;
  process: ChildProcess;
  stop: () => Promise<void>;
};

const STARTUP_TIMEOUT_MS = 60_000;

export async function startDevServer(root: string): Promise<RunningDevServer> {
  const pm = detectPackageManager(root);
  log.dim(`package manager: ${pm}`);

  const cmd = pm === "bun" ? "bun" : pm;
  const args =
    pm === "yarn" ? ["dev"] : pm === "bun" ? ["run", "dev"] : ["run", "dev"];

  log.step(`starting dev server: ${cmd} ${args.join(" ")}`);

  const proc = spawn(cmd, args, {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      BROWSER: "none",
      FORCE_COLOR: "0",
      NODE_ENV: "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  let detected: { url: string; port: number } | null = null;

  proc.stdout?.on("data", (chunk: Buffer) => {
    const s = chunk.toString();
    stdoutBuf += s;
    if (!detected) detected = parseUrl(stdoutBuf);
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    const s = chunk.toString();
    stderrBuf += s;
    if (!detected) detected = parseUrl(stderrBuf);
  });

  const start = Date.now();
  while (!detected) {
    if (proc.exitCode != null) {
      throw new Error(
        `dev server exited before becoming ready (code ${proc.exitCode}).\n` +
          (stderrBuf || stdoutBuf).slice(-2000),
      );
    }
    if (Date.now() - start > STARTUP_TIMEOUT_MS) {
      await killTree(proc);
      throw new Error(
        `dev server did not print a localhost URL within ${STARTUP_TIMEOUT_MS / 1000}s.\n` +
          (stdoutBuf + stderrBuf).slice(-2000),
      );
    }
    await sleep(100);
  }

  // Probe the URL until it actually responds (the URL log can precede readiness)
  await waitUntilHttpReady(detected.url, 30_000);

  log.ok(`dev server ready at ${detected.url}`);

  return {
    url: detected.url,
    port: detected.port,
    process: proc,
    stop: async () => killTree(proc),
  };
}

function parseUrl(buf: string): { url: string; port: number } | null {
  // Strip ANSI just in case
  const clean = buf.replace(/\x1b\[[0-9;]*m/g, "");
  const m =
    clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)\/?/) ??
    clean.match(/https?:\/\/0\.0\.0\.0:(\d+)\/?/);
  if (!m) return null;
  const port = Number(m[1]);
  return { url: `http://localhost:${port}`, port };
}

async function waitUntilHttpReady(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      // any HTTP response counts; even a 404 means the server is up
      if (res.status > 0) return;
    } catch {
      // not yet
    }
    await sleep(200);
  }
  throw new Error(`Dev server URL ${url} never became reachable`);
}

async function killTree(proc: ChildProcess): Promise<void> {
  if (proc.exitCode != null) return;
  try {
    if (proc.pid) {
      // negative pid → the process group when spawned with detached:true
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        proc.kill("SIGTERM");
      }
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    // ignore
  }

  // Give it a moment, then SIGKILL if still alive
  for (let i = 0; i < 25; i++) {
    if (proc.exitCode != null) return;
    await sleep(100);
  }
  try {
    if (proc.pid) {
      try {
        process.kill(-proc.pid, "SIGKILL");
      } catch {
        proc.kill("SIGKILL");
      }
    } else {
      proc.kill("SIGKILL");
    }
  } catch {
    // ignore
  }
}
