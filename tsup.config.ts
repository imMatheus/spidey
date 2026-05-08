import { defineConfig } from "tsup";
import path from "node:path";
import { fileURLToPath } from "node:url";

// @pierre/diffs's exports field doesn't expose the web-components side-effect
// file, so reach into node_modules directly.
const here = path.dirname(fileURLToPath(import.meta.url));
const pierreWebComponents = path.join(
  here,
  "node_modules/@pierre/diffs/dist/components/web-components.js",
);

// Substitute `shiki` with our slim re-export. Default shiki ships maps of
// dynamic imports for ~200 languages and ~50 themes; in an IIFE bundle every
// one of those gets inlined, blowing the bundle to ~9 MB. The stub only
// exposes the 8 languages and 1 theme spidey-sense actually highlights, and
// no-ops the WASM oniguruma engine (we use the JS engine).
const shikiStub = path.join(here, "src/client/shiki-stubs/shiki.mjs");
const emptyStub = path.join(here, "src/client/shiki-stubs/empty.mjs");

// `tsup --watch` (no path) defaults to watching cwd and only ignoring each
// config's own outDir, so writes to dist/cli would re-trigger the plugin/IIFE
// configs and vice-versa — an endless rebuild loop that truncates dist/inject.js
// mid-write. The dev orchestrator (scripts/dev.ts) passes explicit paths via
// `--watch src --watch tsup.config.ts` to scope the watcher tightly. Don't
// hard-code `watch:` in the config below — it forces watch mode on every run
// (including `npm run build` and `npm publish`'s `prepublishOnly`), which then
// hangs the publish.

export default defineConfig([
  // CLI binary (CJS so the shebang works on every Node)
  {
    entry: { index: "src/cli/index.ts" },
    outDir: "dist/cli",
    format: ["cjs"],
    target: "node18",
    platform: "node",
    splitting: false,
    sourcemap: false,
    clean: true,
    shims: true,
    external: ["ws"],
    banner: { js: "#!/usr/bin/env node" },
  },
  // Bundler plugins (ESM + CJS, dual-published). `vite`, `next`, and `react`
  // are the host's dependencies — never bundle them.
  {
    entry: {
      vite: "src/plugin/vite.ts",
      next: "src/plugin/next.tsx",
    },
    outDir: "dist/plugin",
    format: ["esm", "cjs"],
    target: "node18",
    platform: "node",
    splitting: false,
    sourcemap: false,
    clean: false,
    shims: true,
    dts: true,
    external: ["ws", "vite", "next", "react", "react/jsx-runtime"],
    esbuildOptions(options) {
      options.jsx = "automatic";
    },
  },
  // Core browser IIFE that the daemon serves at /spidey-sense.js. Small —
  // doesn't include the diff sidebar (which is loaded on demand from the
  // separate inject-diff.js bundle below).
  {
    entry: { inject: "src/client/index.ts" },
    outDir: "dist",
    format: ["iife"],
    globalName: "SpideySense",
    target: "es2020",
    platform: "browser",
    splitting: false,
    sourcemap: false,
    minify: true,
    clean: false,
    outExtension: () => ({ js: ".js" }),
  },
  // Lazy-loaded diff sidebar bundle. Served at /spidey-sense-diff.js. Only
  // fetched the first time the user opens a diff (clicks a status badge).
  // This is where the heavy stuff — `@pierre/diffs`, shiki — lives.
  {
    entry: { "inject-diff": "src/client/diff-entry.ts" },
    outDir: "dist",
    format: ["iife"],
    globalName: "SpideySenseDiff",
    target: "es2020",
    platform: "browser",
    splitting: false,
    sourcemap: false,
    minify: true,
    clean: false,
    outExtension: () => ({ js: ".js" }),
    esbuildOptions(options) {
      options.alias = {
        ...(options.alias ?? {}),
        "@pierre/diffs/web-components": pierreWebComponents,
        // strip ~9 MB of unused languages, themes, and WASM glue
        shiki: shikiStub,
        "shiki/wasm": emptyStub,
        "@shikijs/engine-oniguruma": shikiStub,
        "@shikijs/engine-oniguruma/wasm-inlined": emptyStub,
      };
    },
  },
]);
