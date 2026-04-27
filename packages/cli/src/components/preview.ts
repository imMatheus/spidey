import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Framework, ComponentSpec } from "@spidey/shared";
import { NOOP_FN_SENTINEL } from "@spidey/shared";
import { dirExists } from "../util.js";

export type ComponentPreview = {
  /** Slug used in the URL path */
  slug: string;
  /** Captured route pattern, e.g. "/spidey_previews/Button-abcdef" */
  url: string;
  component: ComponentSpec;
  propsUsed: Record<string, unknown>;
};

/**
 * Write preview entry files into the user's project so the dev server can
 * serve a one-off page per component. Returns the URL path to capture for
 * each, plus a cleanup function that removes everything we wrote.
 */
export function writePreviews(
  root: string,
  framework: Framework,
  components: ComponentSpec[],
  propsByComponent: Map<string, Record<string, unknown>>,
): { previews: ComponentPreview[]; cleanup: () => void } {
  const previews: ComponentPreview[] = [];
  const cleanups: Array<() => void> = [];

  if (framework === "next") {
    const appDir = dirExists(path.join(root, "app"))
      ? path.join(root, "app")
      : path.join(root, "src/app");
    const previewRoot = path.join(appDir, "spidey_previews");
    fs.mkdirSync(previewRoot, { recursive: true });
    cleanups.push(() => rmrf(previewRoot));

    // Note: we intentionally do NOT write a nested layout.tsx. In Next App
    // Router, child layouts are wrapped by parent layouts — adding our own
    // `<html><body>` would nest inside the user's root layout and break
    // compilation. Previews therefore inherit the user's root layout.

    for (const component of components) {
      const props = propsByComponent.get(slugKey(component)) ?? {};
      const slug = makeSlug(component);
      const dir = path.join(previewRoot, slug);
      fs.mkdirSync(dir, { recursive: true });
      const importPath = relativeImport(dir, component.file);
      fs.writeFileSync(
        path.join(dir, "page.tsx"),
        nextPageSource(component, importPath, props),
      );
      previews.push({
        slug,
        url: `/spidey_previews/${slug}`,
        component,
        propsUsed: props,
      });
    }
  } else {
    // Vite: write top-level HTML + TSX entry pairs. Vite's dev server serves
    // bare HTML files at the project root via its built-in HTML handler.
    const hasRouter = projectHasDep(root, "react-router-dom");
    // Discover the project's global CSS imports — anything imported by the
    // app's main entry. Without this, components styled via class names
    // (e.g. `.btn-primary`) capture as unstyled markup. Components that
    // ship inline styles already work without this.
    const globalCssImports = discoverGlobalCssImports(root);
    for (const component of components) {
      const props = propsByComponent.get(slugKey(component)) ?? {};
      const slug = makeSlug(component);
      const baseName = `__spidey_preview-${slug}`;
      const htmlFile = path.join(root, `${baseName}.html`);
      const tsxFile = path.join(root, `${baseName}.tsx`);
      const importPath = relativeImport(root, component.file);
      fs.writeFileSync(htmlFile, viteHtmlSource(baseName));
      fs.writeFileSync(
        tsxFile,
        viteEntrySource(component, importPath, props, {
          hasRouter,
          globalCssImports,
        }),
      );
      cleanups.push(() => safeUnlink(htmlFile));
      cleanups.push(() => safeUnlink(tsxFile));
      previews.push({
        slug,
        url: `/${baseName}.html`,
        component,
        propsUsed: props,
      });
    }
  }

  return {
    previews,
    cleanup: () => {
      // Run all in LIFO order; never let one failure short-circuit the rest.
      for (const fn of cleanups.reverse()) {
        try {
          fn();
        } catch {
          // ignore
        }
      }
    },
  };
}

export function slugKey(c: ComponentSpec): string {
  return `${c.file}::${c.name}`;
}

function makeSlug(c: ComponentSpec): string {
  const hash = crypto
    .createHash("sha1")
    .update(c.file)
    .digest("hex")
    .slice(0, 6);
  return `${c.name}-${hash}`;
}

function relativeImport(fromDir: string, targetFile: string): string {
  let rel = path.relative(fromDir, targetFile).replace(/\\/g, "/");
  // Strip extension (.tsx / .ts) — bundlers are happier without it.
  rel = rel.replace(/\.(tsx?|jsx?)$/i, "");
  if (!rel.startsWith(".") && !rel.startsWith("/")) rel = "./" + rel;
  return rel;
}

/** Encode props with NOOP_FN_SENTINEL kept as a tagged string so the harness
 *  can rehydrate them as actual no-op functions before passing to the
 *  component. We just JSON-stringify; the harness does the substitution. */
function encodeProps(props: Record<string, unknown>): string {
  return JSON.stringify(props);
}

function importBinding(component: ComponentSpec, alias: string): string {
  if (component.exportKind === "default") {
    return `import ${alias} from "${"@@PATH@@"}";`;
  }
  return `import { ${component.name} as ${alias} } from "${"@@PATH@@"}";`;
}

function nextPageSource(
  component: ComponentSpec,
  importPath: string,
  props: Record<string, unknown>,
): string {
  const alias = "Spidey_Component";
  const importLine = importBinding(component, alias).replace(
    "@@PATH@@",
    importPath,
  );
  return `"use client";
// Auto-generated by Spidey. Do not edit; this file is removed
// after generation completes.
${importLine}

const RAW_PROPS = ${encodeProps(props)} as Record<string, unknown>;

// Props that React intercepts (not forwarded to the component). When
// faker generates a string ref/key, React 18 throws on function
// components — kill them before they reach createElement.
const RESERVED = new Set([
  "ref",
  "key",
  "jsx",
  "jsxs",
  // React rejects this combined with children — faker has no way to know
  // whether the component renders children, so it's never safe to keep.
  "dangerouslySetInnerHTML",
  // Hydration warnings are dev-only and irrelevant for capture.
  "suppressHydrationWarning",
  "suppressContentEditableWarning",
]);

function rehydrate(value: unknown): unknown {
  if (value === ${JSON.stringify(NOOP_FN_SENTINEL)}) return () => {};
  if (Array.isArray(value)) return value.map(rehydrate);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (RESERVED.has(k)) continue;
      // Force \`style\` back to a plain object — faker sometimes hands us
      // a string here and React rejects with a render-killing throw.
      if (k === "style" && (typeof v !== "object" || v === null)) continue;
      out[k] = rehydrate(v);
    }
    return out;
  }
  return value;
}

import React from "react";
class SpideyErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(err: Error) {
    // eslint-disable-next-line no-console
    console.error("[spidey preview]", err);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          font: "12px ui-monospace, Menlo, monospace",
          color: "#b91c1c",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 6,
          padding: "12px 14px",
          maxWidth: 480,
          whiteSpace: "pre-wrap",
        }}>
          {"Component preview crashed:\\n" + String(this.state.error.message)}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Page() {
  const props = rehydrate(RAW_PROPS) as Record<string, unknown>;
  return (
    <div
      style={{
        // Wrapper used by the capture step to measure the natural size of
        // the component preview. Its inline-block ensures the box hugs the
        // component instead of stretching to viewport width/height.
        display: "inline-block",
        padding: 16,
        background: "white",
      }}
      data-spidey-component-root="true"
    >
      <SpideyErrorBoundary>
        {/* @ts-expect-error generated harness - any props */}
        <${alias} {...props} />
      </SpideyErrorBoundary>
    </div>
  );
}
`;
}

function viteHtmlSource(baseName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spidey preview</title>
    <style>html,body{margin:0;padding:0;background:white;}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${baseName}.tsx"></script>
  </body>
</html>
`;
}

function viteEntrySource(
  component: ComponentSpec,
  importPath: string,
  props: Record<string, unknown>,
  opts: { hasRouter: boolean; globalCssImports: string[] },
): string {
  const alias = "Spidey_Component";
  const importLine = importBinding(component, alias).replace(
    "@@PATH@@",
    importPath,
  );
  const routerImport = opts.hasRouter
    ? `import { MemoryRouter } from "react-router-dom";`
    : ``;
  // Pull in the project's global stylesheets so components styled via
  // class names (e.g. `.btn-primary`) actually render styled in their
  // master-tile preview.
  const cssImports = opts.globalCssImports
    .map((p) => `import "${p}";`)
    .join("\n");
  // When the project ships react-router-dom we always wrap so components
  // that use Link/NavLink/useParams/useLocation don't blow up the render.
  // The <Routes/> aren't materialized — just enough context for hooks.
  const wrap = opts.hasRouter
    ? `React.createElement(MemoryRouter, { initialEntries: ["/"] }, inner)`
    : `inner`;
  return `// Auto-generated by Spidey. Do not edit; this file is removed
// after generation completes.
import React from "react";
import ReactDOM from "react-dom/client";
${cssImports}
${routerImport}
${importLine}

const RAW_PROPS = ${encodeProps(props)};

// Props that React intercepts (not forwarded to the component). When
// faker generates a string ref or key, React 18 throws on function
// components — kill them before they reach createElement.
const RESERVED = new Set([
  "ref",
  "key",
  "jsx",
  "jsxs",
  // React rejects this combined with children — faker has no way to know
  // whether the component renders children, so it's never safe to keep.
  "dangerouslySetInnerHTML",
  // Hydration warnings are dev-only and irrelevant for capture.
  "suppressHydrationWarning",
  "suppressContentEditableWarning",
]);

function rehydrate(value) {
  if (value === ${JSON.stringify(NOOP_FN_SENTINEL)}) return () => {};
  if (Array.isArray(value)) return value.map(rehydrate);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (RESERVED.has(k)) continue;
      // Force \`style\` back to a plain object — faker sometimes hands us
      // a string here and React rejects with a render-killing throw on
      // certain prop combinations.
      if (k === "style" && (typeof v !== "object" || v === null)) continue;
      out[k] = rehydrate(v);
    }
    return out;
  }
  return value;
}

const props = rehydrate(RAW_PROPS);

class SpideyErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) {
    // Surface in dev console for the operator running \`spidey generate\`.
    // eslint-disable-next-line no-console
    console.error("[spidey preview]", err, info);
  }
  render() {
    if (this.state.error) {
      return React.createElement(
        "div",
        {
          style: {
            font: "12px ui-monospace, Menlo, monospace",
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            padding: "12px 14px",
            maxWidth: 480,
            whiteSpace: "pre-wrap",
          },
        },
        "Component preview crashed:\\n" + String(this.state.error?.message ?? this.state.error),
      );
    }
    return this.props.children;
  }
}

// Sensible CSS context for the component:
//   - inline-block + fit-content shrinks to the component's natural size
//     so icons render as ~24px tiles, cards at their full width.
//   - explicit color so SVG icons relying on currentColor stay visible.
//   - cap at 480px to keep "responsive width 100%" cards from stretching
//     to the full viewport.
const inner = React.createElement(
  "div",
  {
    style: {
      display: "inline-block",
      padding: 16,
      background: "white",
      color: "#0f172a",
      maxWidth: 480,
      boxSizing: "border-box",
    },
    "data-spidey-component-root": "true",
  },
  React.createElement(
    SpideyErrorBoundary,
    null,
    React.createElement(${alias}, props),
  ),
);

ReactDOM.createRoot(document.getElementById("root")).render(
  ${wrap},
);

// Auto-grow fallback: if the component rendered an empty box (common
// for components that depend on a parent's width), give it a usable
// canvas so capture has something visible to walk.
requestAnimationFrame(() => {
  setTimeout(() => {
    const root = document.querySelector("[data-spidey-component-root]");
    if (!(root instanceof HTMLElement)) return;
    const r = root.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      root.style.width = "320px";
      root.style.minHeight = "80px";
    }
  }, 50);
});
`;
}

/**
 * Find every CSS file imported by the project's main entry, returned as
 * paths suitable for `import "..."` from a TSX file written at project
 * root. Walks the entry once shallowly — we don't follow component-level
 * imports because component-scoped styles already ride along with the
 * component's own bundle.
 *
 * Looks for the entry in this order:
 *   1. `index.html` <script src="...">
 *   2. `src/main.tsx` / `src/main.ts`
 *   3. `src/index.tsx` / `src/index.ts`
 */
function discoverGlobalCssImports(root: string): string[] {
  const entry = findMainEntry(root);
  if (!entry) return [];

  const seen = new Set<string>();
  const cssFiles: string[] = [];

  const walk = (file: string, depth: number) => {
    if (depth > 2) return; // entry → app → root layout is enough
    if (seen.has(file)) return;
    seen.add(file);
    let src: string;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      return;
    }
    const importRe =
      /import\s+(?:(?:[\w*${},\s]+)\s+from\s+)?["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src))) {
      const spec = m[1];
      // CSS imports — collect.
      if (/\.(css|scss|sass|less)(\?.*)?$/.test(spec)) {
        const resolved = resolveImportSpec(file, spec, root);
        if (resolved && !cssFiles.includes(resolved)) cssFiles.push(resolved);
        continue;
      }
      // Local TSX/TS imports — recurse one level so we also see CSS
      // imported by, e.g. `App.tsx` when `main.tsx` only does
      // `import App from "./App"`.
      if (spec.startsWith(".") && depth < 2) {
        const candidates = [".tsx", ".ts", ".jsx", ".js"]
          .map((ext) => path.resolve(path.dirname(file), spec + ext))
          .filter((p) => fileExists(p));
        if (candidates[0]) walk(candidates[0], depth + 1);
      }
    }
  };

  walk(entry, 0);
  return cssFiles;
}

function findMainEntry(root: string): string | null {
  // Try index.html → <script type="module" src="...">
  const indexHtml = path.join(root, "index.html");
  if (fs.existsSync(indexHtml)) {
    try {
      const html = fs.readFileSync(indexHtml, "utf8");
      const m = html.match(/<script[^>]+src=["']([^"']+)["']/i);
      if (m) {
        const rel = m[1].replace(/^\//, "");
        const abs = path.resolve(root, rel);
        if (fs.existsSync(abs)) return abs;
      }
    } catch {
      // ignore
    }
  }
  for (const candidate of [
    "src/main.tsx",
    "src/main.ts",
    "src/index.tsx",
    "src/index.ts",
  ]) {
    const p = path.join(root, candidate);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveImportSpec(
  fromFile: string,
  spec: string,
  root: string,
): string | null {
  // Bare specifier (e.g. `bootstrap/dist/x.css`) — pass through; Vite
  // will resolve from node_modules.
  if (!spec.startsWith(".") && !spec.startsWith("/")) return spec;
  // Relative import — resolve to absolute, then make relative to root so
  // the preview entry (which lives at root) can import it.
  const abs = spec.startsWith("/")
    ? path.resolve(root, spec.replace(/^\//, ""))
    : path.resolve(path.dirname(fromFile), spec);
  let rel = path.relative(root, abs).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function projectHasDep(root: string, dep: string): boolean {
  try {
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return Boolean(
      pkg?.dependencies?.[dep] ||
        pkg?.devDependencies?.[dep] ||
        pkg?.peerDependencies?.[dep],
    );
  } catch {
    return false;
  }
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

function safeUnlink(p: string): void {
  try {
    fs.unlinkSync(p);
  } catch {
    // ignore
  }
}
