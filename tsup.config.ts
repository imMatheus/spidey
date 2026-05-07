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
  // Browser IIFE that the daemon serves at /spidey-grab.js
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
    esbuildOptions(options) {
      options.alias = {
        ...(options.alias ?? {}),
        "@pierre/diffs/web-components": pierreWebComponents,
      };
    },
    watch: WATCH,
  },
]);
