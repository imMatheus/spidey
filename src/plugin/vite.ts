/**
 * Vite plugin for spidey-grab.
 *
 * In dev mode, boots the spidey-grab daemon in the same process as the Vite
 * dev server (no second terminal) and injects a `<script src=".../spidey-grab.js">`
 * into every served HTML page. In build mode the plugin is a no-op so nothing
 * leaks into production bundles.
 *
 * Usage:
 *
 *   // vite.config.ts
 *   import { defineConfig } from "vite";
 *   import spideyGrab from "spidey-grab/vite";
 *
 *   export default defineConfig({
 *     plugins: [spideyGrab()],
 *   });
 */
import { spawnSync } from "node:child_process";
import type { Plugin, ResolvedConfig } from "vite";
import { startServer, type ServerHandle } from "../cli/server";

export interface SpideyGrabPluginOptions {
  /**
   * Port to start the daemon on. If taken, the plugin will pick the next
   * available one. Default: 7878.
   */
  port?: number;
  /**
   * Repo root passed to spawned `claude` jobs. Defaults to the Vite config root
   * (i.e. wherever `vite.config.ts` lives).
   */
  cwd?: string;
  /** Path to the `claude` binary. Default: "claude" (resolved on PATH). */
  claudeBin?: string;
  /** Path to the `codex` binary. Default: "codex" (resolved on PATH). */
  codexBin?: string;
  /**
   * If true, log a warning and skip booting the daemon when the `claude`
   * binary is missing instead of failing the build. Default: true.
   */
  softFailOnMissingClaude?: boolean;
  /**
   * Disable the plugin entirely. Useful for `if (mode === 'production')`
   * style toggles, though the plugin already no-ops outside `serve` mode.
   */
  disabled?: boolean;
}

export default function spideyGrab(options: SpideyGrabPluginOptions = {}): Plugin {
  let handle: ServerHandle | undefined;
  let externalUrl: string | undefined;
  let resolvedConfig: ResolvedConfig | undefined;
  let booting: Promise<{ url: string } | undefined> | undefined;

  const claudeBin = options.claudeBin ?? "claude";
  const codexBin = options.codexBin ?? "codex";
  const softFail = options.softFailOnMissingClaude ?? true;
  const port = options.port ?? 7878;

  return {
    name: "spidey-grab",
    apply: "serve",

    configResolved(config) {
      resolvedConfig = config;
    },

    async configureServer(server) {
      if (options.disabled) return;

      const cwd = options.cwd ?? resolvedConfig?.root ?? process.cwd();

      // If something is already serving spidey-grab on the requested port
      // (typically the standalone CLI started by `bun run dev`), reuse it
      // instead of racing for the same port. Avoids two daemons fighting
      // and the script tag landing on a stale URL.
      const existing = await probeDaemon(`http://localhost:${port}`);
      if (existing) {
        externalUrl = `http://localhost:${port}`;
        server.config.logger.info(
          `\n  \u{1F578}  spidey-grab already running at ${externalUrl} — plugin will reuse it\n`,
        );
        return;
      }

      if (!hasBinary(claudeBin)) {
        const msg =
          `[spidey-grab] '${claudeBin}' binary not found on PATH. ` +
          `Install Claude Code (https://docs.claude.com/claude-code) or pass ` +
          `\`claudeBin\` to spideyGrab(). Skipping daemon boot.`;
        if (softFail) {
          server.config.logger.warn(msg);
          return;
        }
        throw new Error(msg);
      }

      booting = startServer({
        port,
        cwd,
        claudeBin,
        codexBin,
        autoPort: true,
        installSignalHandlers: false,
        printBanner: false,
      })
        .then((h) => {
          handle = h;
          server.config.logger.info(
            `\n  \u{1F578}  spidey-grab listening on ${h.url}\n`,
          );
          return { url: h.url };
        })
        .catch((err) => {
          server.config.logger.error(
            `[spidey-grab] failed to start daemon: ${err?.message || err}`,
          );
          return undefined;
        });

      // tear the daemon down when Vite shuts down
      const stop = () => {
        if (handle) {
          void handle.close();
          handle = undefined;
        }
      };
      server.httpServer?.once("close", stop);
    },

    async transformIndexHtml() {
      if (options.disabled) return;
      // Make sure the daemon is up before we hand the URL to the browser —
      // otherwise the first page load races and 404s on /spidey-grab.js.
      if (booting) await booting;
      const url = externalUrl ?? handle?.url;
      if (!url) return;
      return [
        {
          tag: "script",
          attrs: {
            src: `${url}/spidey-grab.js`,
            "data-spidey-grab": "true",
          },
          injectTo: "head-prepend",
        },
      ];
    },

    async closeBundle() {
      if (handle) {
        await handle.close();
        handle = undefined;
      }
    },
  };
}

/** Quick HEAD-equivalent probe to see if our daemon already owns this port.
 *  Matches on the `service: "spidey-grab"` field so we don't accidentally
 *  reuse some unrelated server that happens to be listening. */
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

function hasBinary(bin: string): boolean {
  try {
    const r = spawnSync(bin, ["--version"], { stdio: "ignore" });
    return !r.error && r.status === 0;
  } catch {
    return false;
  }
}
