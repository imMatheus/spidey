/**
 * Lazy proxy for the diff sidebar.
 *
 * The real `DiffSidebar` (in [diff-sidebar.ts](./diff-sidebar.ts)) drags in
 * `@pierre/diffs` + shiki — together about 1.3 MB of the IIFE bundle. The
 * sidebar is only ever shown when the user clicks a status badge to inspect a
 * job's diff, so paying that cost up-front is wasteful.
 *
 * This module exposes a small class with the same surface (`show(jobId, opts)`).
 * On the first call, it injects a `<script src=".../spidey-grab-diff.js">` into
 * the document, waits for the script to register `window.__SPIDEY_DIFF__`, then
 * forwards the call to the real `DiffSidebar`.
 *
 * Subsequent calls go straight through to the loaded instance.
 */
import type { JobSocket } from "./socket";
import type { AgentKind } from "../protocol";

export interface DiffSidebarOpts {
  parent: HTMLElement;
  baseUrl: string;
  socket: JobSocket;
}

interface DiffSidebarShowOpts {
  pending?: { jobId: string; prompt: string; agent?: AgentKind };
}

interface DiffSidebarLike {
  show(jobId: string, opts?: DiffSidebarShowOpts): Promise<void> | void;
}

interface DiffBundleGlobal {
  DiffSidebar: new (opts: DiffSidebarOpts) => DiffSidebarLike;
}

declare global {
  interface Window {
    __SPIDEY_DIFF__?: DiffBundleGlobal;
  }
}

export class LazyDiffSidebar {
  private opts: DiffSidebarOpts;
  private real: DiffSidebarLike | null = null;
  private loading: Promise<DiffSidebarLike> | null = null;

  constructor(opts: DiffSidebarOpts) {
    this.opts = opts;
  }

  async show(jobId: string, opts: DiffSidebarShowOpts = {}): Promise<void> {
    const real = this.real ?? (await this.load());
    await real.show(jobId, opts);
  }

  private load(): Promise<DiffSidebarLike> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      // If a previous Lazy instance loaded the bundle in this page already,
      // skip the network round-trip.
      if (window.__SPIDEY_DIFF__) {
        return this.instantiate(window.__SPIDEY_DIFF__);
      }

      const url = new URL("spidey-grab-diff.js", this.opts.baseUrl).toString();
      await loadScript(url);

      const bundle = window.__SPIDEY_DIFF__;
      if (!bundle) {
        throw new Error(
          `[spidey-grab] diff bundle loaded from ${url} did not register window.__SPIDEY_DIFF__`,
        );
      }
      return this.instantiate(bundle);
    })();
    return this.loading;
  }

  private instantiate(bundle: DiffBundleGlobal): DiffSidebarLike {
    this.real = new bundle.DiffSidebar(this.opts);
    return this.real;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-spidey-diff-bundle]`,
    );
    if (existing) {
      // Already injected (possibly still loading). Wait for it.
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("diff bundle failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.spideyDiffBundle = "true";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error(`failed to fetch ${src}`)));
    document.head.appendChild(script);
  });
}
