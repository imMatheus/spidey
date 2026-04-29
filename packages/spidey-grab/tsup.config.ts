import { defineConfig } from "tsup";

export default defineConfig([
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
  },
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
  },
]);
