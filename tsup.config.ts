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
// exposes the 8 languages and 1 theme spidey-grab actually highlights, and
// no-ops the WASM oniguruma engine (we use the JS engine).
const shikiStub = path.join(here, "src/client/shiki-stubs/shiki.mjs");
const emptyStub = path.join(here, "src/client/shiki-stubs/empty.mjs");

// Each config below watches ONLY src/** (and tsup.config.ts) when in watch
// mode. The default tsup behaviour is to watch the cwd and only ignore the
// current config's outDir — which means each config's outDir change re-triggers
// every OTHER config, producing an endless rebuild loop. Locking the watch path
// to src avoids that and stops the IIFE from being torn-down/rebuilt mid-request.
const WATCH = ["src/**", "tsup.config.ts"];

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
    watch: WATCH,
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
    watch: WATCH,
  },
  // Core browser IIFE that the daemon serves at /spidey-grab.js. Small —
  // doesn't include the diff sidebar (which is loaded on demand from the
  // separate inject-diff.js bundle below).
  {
    entry: { inject: "src/client/index.ts" },
    outDir: "dist",
    format: ["iife"],
    globalName: "SpideyGrab",
    target: "es2020",
    platform: "browser",
    splitting: false,
    sourcemap: false,
    minify: true,
    clean: false,
    outExtension: () => ({ js: ".js" }),
    watch: WATCH,
  },
  // Lazy-loaded diff sidebar bundle. Served at /spidey-grab-diff.js. Only
  // fetched the first time the user opens a diff (clicks a status badge).
  // This is where the heavy stuff — `@pierre/diffs`, shiki — lives.
  {
    entry: { "inject-diff": "src/client/diff-entry.ts" },
    outDir: "dist",
    format: ["iife"],
    globalName: "SpideyGrabDiff",
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
    watch: WATCH,
  },
]);
