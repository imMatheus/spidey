/**
 * Next.js integration for spidey-grab.
 *
 * Two pieces, because Next doesn't expose a single hook that lets a plugin
 * both boot a side process and inject a `<script>` into the rendered HTML:
 *
 *   1) `withSpideyGrab(nextConfig)` wraps your `next.config.{js,mjs,ts}`.
 *      When `next dev` loads the config, the daemon starts in the same
 *      Node process (no second terminal). It's a no-op in `next build`
 *      and `next start` (NODE_ENV === "production").
 *
 *   2) `<SpideyGrab />` is a server component you drop inside the `<head>`
 *      of your root layout (App Router) or `_document.tsx` (Pages Router).
 *      In dev it renders a `<script async src="http://localhost:PORT/spidey-grab.js" />`;
 *      in prod it renders nothing.
 *
 * The two pieces communicate via `process.env.SPIDEY_GRAB_PORT`, which
 * `withSpideyGrab` sets after the daemon picks a free port.
 *
 * Usage:
 *
 *   // next.config.mjs
 *   import { withSpideyGrab } from "spidey-grab/next";
 *   export default withSpideyGrab({});
 *
 *   // app/layout.tsx
 *   import { SpideyGrab } from "spidey-grab/next";
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html>
 *         <head><SpideyGrab /></head>
 *         <body>{children}</body>
 *       </html>
 *     );
 *   }
 */
import { spawnSync } from "node:child_process";
import { startServer, type ServerHandle } from "../cli/server";

export interface SpideyGrabNextOptions {
  /** Port to start the daemon on. Auto-bumps if taken. Default: 7878. */
  port?: number;
  /** Repo root passed to spawned `claude` jobs. Default: `process.cwd()`. */
  cwd?: string;
  /** Path to the `claude` binary. Default: "claude" on PATH. */
  claudeBin?: string;
  /** Path to the `codex` binary. Default: "codex" on PATH. */
  codexBin?: string;
  /**
   * Log a warning instead of throwing when `claude` is missing. Default: true.
   */
  softFailOnMissingClaude?: boolean;
}

let bootPromise: Promise<ServerHandle | undefined> | undefined;

export function withSpideyGrab<T extends object>(
  nextConfig: T = {} as T,
  options: SpideyGrabNextOptions = {},
): T {
  // No-op for `next build` / `next start`. Next sets NODE_ENV before loading
  // the config file, so this is a reliable signal.
  if (process.env.NODE_ENV === "production") return nextConfig;

  // Next can re-evaluate next.config.* across the lifetime of a single dev
  // run (HMR, route group reloads). Guard so we only boot one daemon.
  if (bootPromise) return nextConfig;

  const claudeBin = options.claudeBin ?? "claude";
  const softFail = options.softFailOnMissingClaude ?? true;
  const port = options.port ?? 7878;

  bootPromise = (async () => {
    // If a standalone CLI (or another Next instance) is already serving the
    // daemon on this port, point at it instead of trying to bind too.
    if (await probeDaemon(`http://localhost:${port}`)) {
      process.env.SPIDEY_GRAB_PORT = String(port);
      console.log(`\n  \u{1F578}  spidey-grab already running at http://localhost:${port} — reusing it\n`);
      return undefined;
    }

    if (!hasBinary(claudeBin)) {
      const msg =
        `[spidey-grab] '${claudeBin}' binary not found on PATH. ` +
        `Install Claude Code (https://docs.claude.com/claude-code) or pass ` +
        `\`claudeBin\` to withSpideyGrab(). Skipping daemon boot.`;
      if (softFail) {
        console.warn(msg);
        return undefined;
      }
      throw new Error(msg);
    }

    try {
      const handle = await startServer({
        port,
        cwd: options.cwd ?? process.cwd(),
        claudeBin,
        codexBin: options.codexBin ?? "codex",
        autoPort: true,
        installSignalHandlers: false,
        printBanner: false,
      });

      // The component reads this to know which port to point its script tag at.
      process.env.SPIDEY_GRAB_PORT = String(handle.port);

      console.log(`\n  \u{1F578}  spidey-grab listening on ${handle.url}\n`);

      const cleanup = () => {
        void handle.close();
      };
      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
      process.once("exit", cleanup);

      return handle;
    } catch (err) {
      console.warn(
        `[spidey-grab] failed to start daemon: ${(err as Error)?.message || err}`,
      );
      return undefined;
    }
  })();

  return nextConfig;
}

/**
 * Server component. Drop inside `<head>` of `app/layout.tsx` (App Router)
 * or `_document.tsx` (Pages Router). Renders nothing in production.
 */
export function SpideyGrab() {
  if (process.env.NODE_ENV === "production") return null;
  const port = process.env.SPIDEY_GRAB_PORT || "7878";
  return (
    <script
      async
      src={`http://localhost:${port}/spidey-grab.js`}
      data-spidey-grab="true"
    />
  );
}

function hasBinary(bin: string): boolean {
  try {
    const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}

async function probeDaemon(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = (await res.json()) as { service?: string };
    return body.service === "spidey-grab";
  } catch {
    return false;
  }
}
