/**
 * Slim re-export of `shiki` for spidey-grab's browser bundle.
 *
 * The default `shiki` entry — and the `shiki/bundle/full` entry that it uses
 * — re-export `bundledLanguages` and `bundledThemes`, which together are
 * dynamic-import maps for ~200 grammars and ~50 themes. In an IIFE bundle
 * (no runtime module loader) esbuild has to inline every one of those
 * imports — that's the 9 MB of `@shikijs/langs` + `@shikijs/themes` that
 * previously dominated `dist/inject.js`.
 *
 * @pierre/diffs only looks up languages/themes by name in those maps, so we
 * can safely substitute reduced versions covering the languages spidey-grab
 * actually highlights (typescript/javascript/tsx/jsx/json/css/html/markdown),
 * plus a single theme (github-light). That alone takes the bundle from
 * ~9.6 MB to under 1 MB.
 *
 * tsup aliases `shiki` to this file in the IIFE build (see tsup.config.ts).
 * The CLI/plugin builds are unaffected — they don't import shiki at all.
 */
import {
  createBundledHighlighter,
  createSingletonShorthands,
  guessEmbeddedLanguages,
} from "@shikijs/core";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

export {
  createJavaScriptRegexEngine,
  defaultJavaScriptRegexConstructor,
} from "@shikijs/engine-javascript";

// Re-export everything from the core (theme normalization, hast helpers, types,
// transformers, etc.). This is small (~30 KB).
export * from "@shikijs/core";

// --- Reduced bundles ------------------------------------------------------
// Only the languages and themes spidey-grab's diff sidebar actually renders.
// Each entry is a lazy `() => import(...)`; esbuild will inline these in the
// IIFE build, so the cost of adding a new language is roughly its grammar
// JSON size (typically 20-60 KB minified).

export const bundledLanguages = {
  typescript: () => import("@shikijs/langs/typescript"),
  javascript: () => import("@shikijs/langs/javascript"),
  tsx: () => import("@shikijs/langs/tsx"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  css: () => import("@shikijs/langs/css"),
};

export const bundledLanguagesAlias = {
  ts: bundledLanguages.typescript,
  js: bundledLanguages.javascript,
};

export const bundledLanguagesBase = bundledLanguages;
export const bundledLanguagesInfo = [];

export const bundledThemes = {
  "github-light": () => import("@shikijs/themes/github-light"),
};

export const bundledThemesInfo = [];

// --- High-level API surface ----------------------------------------------
// Re-create the helpers `shiki/bundle/full` provides, but using the JS engine
// (no WASM) and our reduced bundle maps.

export const createHighlighter = /* @__PURE__ */ createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
});

export const {
  codeToHtml,
  codeToHast,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = /* @__PURE__ */ createSingletonShorthands(createHighlighter, {
  guessEmbeddedLanguages,
});

// --- Oniguruma stub -------------------------------------------------------
// Spidey-grab sets `preferredHighlighter: "shiki-js"` so the WASM engine is
// never invoked. @pierre/diffs imports `createOnigurumaEngine` and `loadWasm`
// at module-eval time but never *calls* them in the JS-engine code path, so
// we can safely no-op them and drop ~614 KB of WASM-loader JS.

export function createOnigurumaEngine() {
  throw new Error(
    "[spidey-grab] oniguruma engine was stubbed out; use createJavaScriptRegexEngine instead",
  );
}

export function loadWasm() {
  // no-op
}
