/**
 * Entry point for the lazy diff bundle (built to `dist/inject-diff.js`,
 * served by the daemon at `/spidey-grab-diff.js`).
 *
 * The core IIFE ([index.ts](./index.ts)) ships with [LazyDiffSidebar](./lazy-diff-sidebar.ts)
 * — a small proxy that, on first `show()`, loads this bundle via a `<script>`
 * tag and waits for `window.__SPIDEY_DIFF__` to appear.
 *
 * That global is the only thing this entry produces.
 */
import { DiffSidebar } from "./diff-sidebar";

declare global {
  interface Window {
    __SPIDEY_DIFF__?: { DiffSidebar: typeof DiffSidebar };
  }
}

window.__SPIDEY_DIFF__ = { DiffSidebar };
