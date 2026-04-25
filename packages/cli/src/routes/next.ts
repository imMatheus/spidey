import fs from "node:fs";
import path from "node:path";
import { dirExists } from "../util.js";
import { isCatchAll, substitutePlaceholders } from "./placeholders.js";

export type DiscoveredRoute = {
  pattern: string;
  url: string;
};

const PAGE_FILENAMES = new Set([
  "page.tsx",
  "page.ts",
  "page.jsx",
  "page.js",
]);

/**
 * Walk the Next.js app/ directory and return one route per page.* file.
 * Group segments "(group)" are stripped, parallel routes "@slot" are skipped,
 * private segments "_foo" are skipped, catch-all segments are skipped in v0.
 */
export function discoverNextRoutes(root: string): DiscoveredRoute[] {
  const appDirs = [path.join(root, "app"), path.join(root, "src/app")].filter(
    dirExists,
  );
  if (appDirs.length === 0) return [];

  const routes: DiscoveredRoute[] = [];

  for (const appDir of appDirs) {
    walk(appDir, [], routes);
  }

  // dedupe by pattern, sort by depth then alpha
  const seen = new Set<string>();
  const out: DiscoveredRoute[] = [];
  for (const r of routes) {
    if (seen.has(r.pattern)) continue;
    seen.add(r.pattern);
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

function walk(
  dir: string,
  segments: string[],
  out: DiscoveredRoute[],
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Has page in this dir?
  const hasPage = entries.some((e) => e.isFile() && PAGE_FILENAMES.has(e.name));
  if (hasPage) {
    const pattern = "/" + segments.filter((s) => s !== "").join("/");
    const cleanPattern = pattern === "//" ? "/" : pattern;
    if (!isCatchAll(cleanPattern)) {
      out.push({
        pattern: cleanPattern,
        url: substitutePlaceholders(cleanPattern),
      });
    }
  }

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    // Skip private segments and parallel/intercepting route slots in v0
    if (name.startsWith("_")) continue;
    if (name.startsWith("@")) continue;
    if (name.startsWith("(.)") || name.startsWith("(..)")) continue;

    let segment: string;
    if (name.startsWith("(") && name.endsWith(")")) {
      // route group → no segment contribution
      segment = "";
    } else if (name.startsWith("[") && name.endsWith("]")) {
      segment = name; // dynamic, kept as-is in pattern
    } else {
      segment = name;
    }

    walk(path.join(dir, name), [...segments, segment], out);
  }
}
