import fs from "node:fs";
import path from "node:path";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

export const log = {
  info: (msg: string) => console.log(`${COLORS.cyan}•${COLORS.reset} ${msg}`),
  step: (msg: string) => console.log(`${COLORS.blue}→${COLORS.reset} ${msg}`),
  ok: (msg: string) => console.log(`${COLORS.green}✓${COLORS.reset} ${msg}`),
  warn: (msg: string) =>
    console.log(`${COLORS.yellow}!${COLORS.reset} ${msg}`),
  err: (msg: string) => console.error(`${COLORS.red}✗${COLORS.reset} ${msg}`),
  dim: (msg: string) => console.log(`  ${COLORS.dim}${msg}${COLORS.reset}`),
};

export function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function findFirst(root: string, candidates: string[]): string | null {
  for (const c of candidates) {
    const p = path.join(root, c);
    if (fileExists(p)) return p;
  }
  return null;
}

export function readJsonSafe(p: string): any {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

export function detectPackageManager(root: string): "bun" | "npm" | "pnpm" | "yarn" {
  if (fileExists(path.join(root, "bun.lockb")) || fileExists(path.join(root, "bun.lock")))
    return "bun";
  if (fileExists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fileExists(path.join(root, "yarn.lock"))) return "yarn";
  return "npm";
}

export function walkFiles(
  root: string,
  filter: (filePath: string) => boolean,
  options: { ignore?: string[] } = {},
): string[] {
  const ignore = new Set(
    options.ignore ?? ["node_modules", ".next", ".git", "dist", "build", ".turbo"],
  );
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (ignore.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && filter(full)) out.push(full);
    }
  }
  return out;
}

export function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
