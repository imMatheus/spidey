/**
 * Next.js integration for spidey-sense.
 *
 * Two pieces, because Next doesn't expose a single hook that lets a plugin
 * both boot a side process and inject a `<script>` into the rendered HTML:
 *
 *   1) `withSpideySense(nextConfig)` wraps your `next.config.{js,mjs,ts}`.
 *      When `next dev` loads the config, the daemon starts in the same
 *      Node process (no second terminal). It's a no-op in `next build`
 *      and `next start` (NODE_ENV === "production").
 *
 *   2) `<SpideySense />` is a server component you drop inside the `<head>`
 *      of your root layout (App Router) or `_document.tsx` (Pages Router).
 *      In dev it renders a `<script async src="http://localhost:PORT/spidey-sense.js" />`;
 *      in prod it renders nothing.
 *
 * The two pieces communicate via `process.env.SPIDEY_SENSE_PORT`, which
 * `withSpideySense` sets after the daemon picks a free port.
 *
 * Usage:
 *
 *   // next.config.mjs
 *   import { withSpideySense } from "spidey-sense/next";
 *   export default withSpideySense({});
 *
 *   // app/layout.tsx
 *   import { SpideySense } from "spidey-sense/next";
 *   export default function RootLayout({ children }) {
 *     return (
 *       <html>
 *         <head><SpideySense /></head>
 *         <body>{children}</body>
 *       </html>
 *     );
 *   }
 */
import { spawnSync } from "node:child_process";
import { startServer, type ServerHandle } from "../cli/server";

export interface SpideySenseNextOptions {
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

export function withSpideySense<T extends object>(
  nextConfig: T = {} as T,
  options: SpideySenseNextOptions = {},
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
    const ourCwd = options.cwd ?? process.cwd();
    // If a standalone CLI (or another Next instance) is already serving the
    // daemon on this port, point at it instead of trying to bind too. But
    // only when its cwd matches ours — otherwise we'd route prompts at a
    // daemon pointing at a different repo and silently edit nothing.
    const existing = await probeDaemon(`http://localhost:${port}`);
    if (existing && cwdsMatch(existing.cwd, ourCwd)) {
      process.env.SPIDEY_SENSE_PORT = String(port);
      console.log(`\n  \u{1F578}  spidey-sense already running at http://localhost:${port} — reusing it\n`);
      return undefined;
    }
    if (existing) {
      console.warn(
        `[spidey-sense] port ${port} is held by another spidey-sense daemon ` +
          `(cwd: ${existing.cwd ?? "unknown"}). Starting a fresh daemon on ` +
          `the next free port for this project (${ourCwd}).`,
      );
    }

    if (!hasBinary(claudeBin)) {
      const msg =
        `[spidey-sense] '${claudeBin}' binary not found on PATH. ` +
        `Install Claude Code (https://docs.claude.com/claude-code) or pass ` +
        `\`claudeBin\` to withSpideySense(). Skipping daemon boot.`;
      if (softFail) {
        console.warn(msg);
        return undefined;
      }
      throw new Error(msg);
    }

    try {
      const handle = await startServer({
        port,
        cwd: ourCwd,
        claudeBin,
        codexBin: options.codexBin ?? "codex",
        autoPort: true,
        installSignalHandlers: false,
        printBanner: false,
        // We only get here in dev (production exits early at the top).
        // Watching dist/inject.js means rebuilds trigger an in-page reload.
        watchBundles: true,
      });

      // The component reads this to know which port to point its script tag at.
      process.env.SPIDEY_SENSE_PORT = String(handle.port);

      console.log(`\n  \u{1F578}  spidey-sense listening on ${handle.url}\n`);

      const cleanup = () => {
        void handle.close();
      };
      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
      process.once("exit", cleanup);

      return handle;
    } catch (err) {
      console.warn(
        `[spidey-sense] failed to start daemon: ${(err as Error)?.message || err}`,
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
export function SpideySense() {
  if (process.env.NODE_ENV === "production") return null;
  const port = process.env.SPIDEY_SENSE_PORT || "7878";
  return (
    <script
      async
      src={`http://localhost:${port}/spidey-sense.js`}
      data-spidey-sense="true"
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

async function probeDaemon(
  url: string,
): Promise<{ cwd: string | undefined } | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 500);
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = (await res.json()) as { service?: string; cwd?: string };
    if (body.service !== "spidey-sense") return null;
    return { cwd: body.cwd };
  } catch {
    return null;
  }
}

function cwdsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
