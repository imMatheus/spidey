import fs from "node:fs";
import path from "node:path";
import { dirExists } from "../util.js";

/**
 * Substitute concrete values for dynamic params in a route pattern.
 *
 * Supports both Next ("/users/[id]") and React Router (":id") styles.
 * Catch-all and optional-catch-all segments are NOT substituted — caller
 * should filter them out for v0.
 *
 * When `projectRoot` is provided, the substitution will look in
 * convention-driven content directories (e.g. `_blog/`, `_customers/`,
 * `content/<route>/`) for a real slug to use instead of a generic
 * placeholder. This avoids 404s on data-driven Pages Router routes.
 */
export function substitutePlaceholders(
  pattern: string,
  projectRoot?: string,
): string {
  // Walk the pattern segment-by-segment so we can pick a slug that's
  // appropriate for the *previous* segment (e.g. /blog/[slug] looks under
  // _blog/, /customers/[slug] looks under _customers/).
  const segments = pattern.split("/");
  let url = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === "") {
      url += "/";
      continue;
    }
    if (i > 1) url += "/";
    else url += "";
    // Next-style [param]
    let resolved: string;
    const nextMatch = seg.match(/^\[([^\]]+)\]$/);
    const rrMatch = seg.match(/^:([A-Za-z_][A-Za-z0-9_]*)\??$/);
    if (nextMatch || rrMatch) {
      const name = (nextMatch ?? rrMatch)![1];
      const parent = segments.slice(0, i).filter(Boolean).join("/");
      resolved =
        (projectRoot
          ? findContentSlug(projectRoot, parent)
          : null) ?? placeholderFor(name);
    } else {
      resolved = seg;
    }
    url += resolved;
  }
  // Normalize: collapse leading double slash that comes from segments[0]==="".
  return url.replace(/^\/+/, "/");
}

export function isCatchAll(pattern: string): boolean {
  // Next [...slug] / [[...slug]] or React Router * splats
  return /\[\.\.\.|\*$|\*\/|\/\*$/.test(pattern);
}

function placeholderFor(name: string): string {
  const lower = name.toLowerCase();
  if (
    lower === "id" ||
    lower.endsWith("id") ||
    lower === "num" ||
    lower === "index"
  )
    return "1";
  if (lower === "slug" || lower === "name" || lower === "handle") return "example";
  if (lower === "lang" || lower === "locale") return "en";
  return "placeholder";
}

/**
 * Try to find a real slug for a dynamic route by checking convention-driven
 * content locations. Returns the basename (without extension and any leading
 * date prefix) of the first content file found. Caller falls back to the
 * generic placeholder when this returns null.
 *
 * Looks in (in order):
 *   - `_<parent>/`           — Supabase / Next-blog convention
 *   - `content/<parent>/`    — common MDX docs setups
 *   - `data/<parent>/`       — common static content setups
 *
 * `parent` is the URL path leading up to the slug, e.g. `"blog"` for
 * `/blog/[slug]` or `"blog/authors"` for `/blog/authors/[author]`.
 */
function findContentSlug(projectRoot: string, parent: string): string | null {
  if (!parent) return null;
  // Use the last segment as the convention key — `_<lastSeg>/` is much more
  // common than `_<full/path>/`.
  const lastSeg = parent.split("/").pop() || parent;
  const candidates = [
    path.join(projectRoot, "_" + lastSeg),
    path.join(projectRoot, "content", lastSeg),
    path.join(projectRoot, "data", lastSeg),
    path.join(projectRoot, "_" + parent.replace(/\//g, "-")),
  ];
  for (const dir of candidates) {
    if (!dirExists(dir)) continue;
    const slug = firstSlugIn(dir);
    if (slug) return slug;
  }
  // Last-resort: hardcoded slug literals in a TS/TSX/JSON data file like
  // `data/<lastSeg>.tsx`. Catches setups where slugs live in a typed array
  // rather than as filenames (Supabase www does this for `/features`).
  const dataFiles = [
    path.join(projectRoot, "data", lastSeg + ".tsx"),
    path.join(projectRoot, "data", lastSeg + ".ts"),
    path.join(projectRoot, "data", lastSeg + ".json"),
  ];
  for (const f of dataFiles) {
    try {
      const text = fs.readFileSync(f, "utf8");
      const m = text.match(/slug\s*:\s*['"`]([^'"`\s]+)['"`]/);
      if (m) return m[1];
    } catch {
      // not present — try next
    }
  }
  return null;
}

function firstSlugIn(dir: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  // Prefer .mdx > .md > .json files; alphabetical within each group.
  const exts = [".mdx", ".md", ".json"];
  for (const ext of exts) {
    const matches = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(ext))
      .map((e) => e.name)
      .sort();
    for (const name of matches) {
      const slug = stripDatePrefix(name.slice(0, -ext.length));
      if (slug) return slug;
    }
  }
  // No file? Maybe each entity is a folder containing index.mdx.
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const slug = stripDatePrefix(e.name);
    if (slug) return slug;
  }
  return null;
}

/**
 * Strip a leading date-style prefix that's used for sort order but isn't
 * part of the URL slug. Handles `2024-08-21-foo`, `2024-08-21__foo`, and
 * `20240821-foo`.
 */
function stripDatePrefix(name: string): string {
  return name
    .replace(/^\d{4}-\d{2}-\d{2}[-_]+/, "")
    .replace(/^\d{8}[-_]+/, "");
}
