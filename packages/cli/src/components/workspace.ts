import fs from "node:fs";
import path from "node:path";
import { dirExists, fileExists, readJsonSafe } from "../util.js";

/**
 * A workspace package exposed as an additional component-discovery root.
 *
 * `path` is the package directory; `name` is the package.json `name` field
 * (used for labels and to match the project's `workspace:*` deps).
 */
export type WorkspacePackage = {
  name: string;
  path: string;
};

/**
 * Find the monorepo root by walking up from `projectRoot` until we hit a
 * directory that declares workspaces. Returns null if no monorepo is found
 * (e.g. a single-package project).
 *
 * Recognises pnpm (`pnpm-workspace.yaml`) and npm/yarn workspaces
 * (`workspaces` field in package.json).
 */
export function findMonorepoRoot(projectRoot: string): string | null {
  let dir = path.resolve(projectRoot);
  // Avoid walking out of the user's home directory.
  for (let i = 0; i < 8; i++) {
    if (fileExists(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const pkg = readJsonSafe(path.join(dir, "package.json"));
    if (pkg && pkg.workspaces) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Read the workspace `packages:` globs from `pnpm-workspace.yaml` or
 * `workspaces` array in package.json.
 *
 * pnpm-workspace.yaml is parsed line-by-line — we only need the `packages`
 * list, which is simple enough to extract without a YAML parser dep.
 */
function readWorkspaceGlobs(monorepoRoot: string): string[] {
  const pnpmYaml = path.join(monorepoRoot, "pnpm-workspace.yaml");
  if (fileExists(pnpmYaml)) {
    const text = fs.readFileSync(pnpmYaml, "utf8");
    const globs: string[] = [];
    let inPackages = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^packages\s*:/.test(line)) {
        inPackages = true;
        continue;
      }
      if (inPackages) {
        // Stop at the next top-level key.
        if (/^[a-zA-Z]/.test(line)) {
          inPackages = false;
          continue;
        }
        const m = line.match(/^\s*-\s*['"]?([^'"\s#]+)['"]?/);
        if (m) globs.push(m[1]);
      }
    }
    return globs;
  }

  const pkg = readJsonSafe(path.join(monorepoRoot, "package.json"));
  if (pkg?.workspaces) {
    if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
    if (Array.isArray(pkg.workspaces?.packages))
      return pkg.workspaces.packages;
  }
  return [];
}

/**
 * Expand a workspace glob (`apps/*`, `packages/**`) into concrete package
 * directories. Each returned dir has a package.json.
 */
function expandGlob(monorepoRoot: string, glob: string): string[] {
  const parts = glob.split("/").filter(Boolean);
  const out: string[] = [];

  function walk(dir: string, partIdx: number) {
    if (partIdx >= parts.length) {
      if (fileExists(path.join(dir, "package.json"))) out.push(dir);
      return;
    }
    const seg = parts[partIdx];
    if (seg === "**") {
      // Zero-or-more directories — also try matching with this segment
      // consumed at the current dir.
      walk(dir, partIdx + 1);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        walk(path.join(dir, e.name), partIdx);
      }
      return;
    }
    if (seg === "*") {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith(".") || e.name === "node_modules") continue;
        walk(path.join(dir, e.name), partIdx + 1);
      }
      return;
    }
    walk(path.join(dir, seg), partIdx + 1);
  }

  walk(monorepoRoot, 0);
  return out;
}

/**
 * Enumerate every workspace package in the monorepo (name + path).
 */
export function listWorkspacePackages(
  monorepoRoot: string,
): WorkspacePackage[] {
  const globs = readWorkspaceGlobs(monorepoRoot);
  const packages: WorkspacePackage[] = [];
  const seenPaths = new Set<string>();
  for (const glob of globs) {
    for (const dir of expandGlob(monorepoRoot, glob)) {
      if (seenPaths.has(dir)) continue;
      seenPaths.add(dir);
      const pkg = readJsonSafe(path.join(dir, "package.json"));
      if (!pkg?.name) continue;
      packages.push({ name: pkg.name, path: dir });
    }
  }
  return packages;
}

/**
 * For a project at `projectRoot`, return the workspace packages it depends on
 * (via `workspace:*` or any `workspace:` protocol). These are the packages
 * whose components a Spidey user would expect to see surfaced — `ui`,
 * `ui-patterns`, etc. — alongside the project's local components.
 *
 * Returns [] when not in a monorepo or when no workspace deps are found.
 */
export function findWorkspaceComponentRoots(
  projectRoot: string,
): WorkspacePackage[] {
  const monorepoRoot = findMonorepoRoot(projectRoot);
  if (!monorepoRoot) return [];
  if (path.resolve(monorepoRoot) === path.resolve(projectRoot)) return [];

  const projectPkg = readJsonSafe(path.join(projectRoot, "package.json"));
  if (!projectPkg) return [];

  const deps: Record<string, string> = {
    ...(projectPkg.dependencies ?? {}),
    ...(projectPkg.devDependencies ?? {}),
    ...(projectPkg.peerDependencies ?? {}),
  };
  const workspaceDepNames = new Set<string>();
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === "string" && spec.startsWith("workspace:")) {
      workspaceDepNames.add(name);
    }
  }
  if (workspaceDepNames.size === 0) return [];

  const all = listWorkspacePackages(monorepoRoot);

  const out: WorkspacePackage[] = [];
  for (const wp of all) {
    if (!workspaceDepNames.has(wp.name)) continue;
    if (path.resolve(wp.path) === path.resolve(projectRoot)) continue;
    // Only include packages that look like they ship UI (i.e. have a `src/`
    // or expose `.tsx` files). Type-only / config-only packages have nothing
    // visual for us to capture.
    if (!packageHasComponents(wp.path)) continue;
    out.push(wp);
  }
  return out;
}

function packageHasComponents(pkgPath: string): boolean {
  const candidates = [
    path.join(pkgPath, "src"),
    path.join(pkgPath, "components"),
    pkgPath,
  ];
  for (const c of candidates) {
    if (!dirExists(c)) continue;
    if (containsTsx(c, 3)) return true;
  }
  return false;
}

function containsTsx(dir: string, maxDepth: number): boolean {
  if (maxDepth < 0) return false;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isFile() && e.name.endsWith(".tsx")) return true;
    if (e.isDirectory() && containsTsx(path.join(dir, e.name), maxDepth - 1))
      return true;
  }
  return false;
}
