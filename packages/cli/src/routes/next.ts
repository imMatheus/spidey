import fs from "node:fs";
import path from "node:path";
import { dirExists } from "../util.js";
import { isCatchAll, substitutePlaceholders } from "./placeholders.js";

export type DiscoveredRoute = {
  pattern: string;
  url: string;
};

const APP_PAGE_FILENAMES = new Set([
  "page.tsx",
  "page.ts",
  "page.jsx",
  "page.js",
  "page.mdx",
  "page.md",
]);

// Files inside a Pages Router directory that are not routes themselves.
const PAGES_ROUTER_RESERVED = new Set([
  "_app",
  "_document",
  "_error",
  "_middleware",
  "404",
  "500",
  "middleware",
  "instrumentation",
]);

const PAGES_ROUTER_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mdx", ".md"];

/**
 * Walk the Next.js project and return one route per page file.
 *
 * Supports both routers:
 *  - App Router (`app/`, `src/app/`): page.tsx files; group segments
 *    "(group)" stripped, parallel routes "@slot" skipped, private segments
 *    "_foo" skipped, catch-all skipped in v0.
 *  - Pages Router (`pages/`, `src/pages/`): file-based routes; `_app`,
 *    `_document`, `404`, `500`, `api/` skipped; catch-all skipped in v0.
 *
 * When both routers define the same URL the App Router entry wins (matches
 * the production Next behavior — App Router takes precedence on conflicts).
 */
export function discoverNextRoutes(root: string): DiscoveredRoute[] {
  const appDirs = [path.join(root, "app"), path.join(root, "src/app")].filter(
    dirExists,
  );
  const pagesDirs = [
    path.join(root, "pages"),
    path.join(root, "src/pages"),
  ].filter(dirExists);

  const appRoutes: DiscoveredRoute[] = [];
  for (const dir of appDirs) walkAppRouter(dir, [], appRoutes, root);

  const pageRoutes: DiscoveredRoute[] = [];
  for (const dir of pagesDirs) walkPagesRouter(dir, [], pageRoutes, root);

  // App Router wins on conflict (production Next behavior).
  const seenPattern = new Set<string>();
  const seenUrl = new Set<string>();
  const out: DiscoveredRoute[] = [];
  for (const r of [...appRoutes, ...pageRoutes]) {
    if (seenPattern.has(r.pattern)) continue;
    if (seenUrl.has(r.url)) continue;
    seenPattern.add(r.pattern);
    seenUrl.add(r.url);
    out.push(r);
  }
  out.sort((a, b) => {
    const da = a.pattern.split("/").length;
    const db = b.pattern.split("/").length;
    if (da !== db) return da - db;
    return a.pattern.localeCompare(b.pattern);
  });
  return out;
}

function walkAppRouter(
  dir: string,
  segments: string[],
  out: DiscoveredRoute[],
  projectRoot: string,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const hasPage = entries.some(
    (e) => e.isFile() && APP_PAGE_FILENAMES.has(e.name),
  );
  if (hasPage) {
    const pattern = "/" + segments.filter((s) => s !== "").join("/");
    const cleanPattern = pattern === "//" ? "/" : pattern;
    if (!isCatchAll(cleanPattern)) {
      out.push({
        pattern: cleanPattern,
        url: substitutePlaceholders(cleanPattern, projectRoot),
      });
    }
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    if (name.startsWith("_")) continue;
    if (name.startsWith("@")) continue;
    if (name.startsWith("(.)") || name.startsWith("(..)")) continue;

    let segment: string;
    if (name.startsWith("(") && name.endsWith(")")) {
      segment = ""; // route group → no segment contribution
    } else if (name.startsWith("[") && name.endsWith("]")) {
      segment = name; // dynamic, kept as-is
    } else {
      segment = name;
    }

    walkAppRouter(
      path.join(dir, name),
      [...segments, segment],
      out,
      projectRoot,
    );
  }
}

function walkPagesRouter(
  dir: string,
  segments: string[],
  out: DiscoveredRoute[],
  projectRoot: string,
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    const name = e.name;

    if (e.isDirectory()) {
      // API routes are server-only; skip the whole subtree.
      if (segments.length === 0 && name === "api") continue;
      // Hidden / private subtrees.
      if (name.startsWith(".")) continue;

      let seg: string;
      if (name.startsWith("[") && name.endsWith("]")) seg = name;
      else seg = name;

      walkPagesRouter(
        path.join(dir, name),
        [...segments, seg],
        out,
        projectRoot,
      );
      continue;
    }

    if (!e.isFile()) continue;
    const ext = path.extname(name);
    if (!PAGES_ROUTER_EXTS.includes(ext)) continue;
    const base = name.slice(0, -ext.length);
    if (PAGES_ROUTER_RESERVED.has(base)) continue;
    // Tests / type-tests adjacent to pages.
    if (/\.(test|spec)$/.test(base)) continue;

    let routeSegments: string[];
    if (base === "index") {
      routeSegments = [...segments];
    } else {
      routeSegments = [...segments, base];
    }

    const pattern =
      routeSegments.length === 0 ? "/" : "/" + routeSegments.join("/");
    if (isCatchAll(pattern)) continue;

    out.push({
      pattern,
      url: substitutePlaceholders(pattern, projectRoot),
    });
  }
}
