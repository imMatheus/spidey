import {
  getFiberFromHostInstance,
  isCompositeFiber,
  getDisplayName,
  type Fiber,
} from "bippy";
import { getSource } from "bippy/source";
import type { ResolvedTarget } from "./source";

export interface Fingerprint {
  tagName: string;
  textPreview: string;
  displayName: string | null;
  classes: string[];
  source: { file: string; line?: number } | null;
}

export function buildFingerprint(target: Element, resolved: ResolvedTarget): Fingerprint {
  return {
    tagName: target.tagName.toLowerCase(),
    textPreview: resolved.context.textPreview,
    displayName: resolved.context.displayName,
    classes: resolved.context.classes,
    source: resolved.source
      ? { file: resolved.source.file, line: resolved.source.line }
      : null,
  };
}

export async function findByFingerprint(fp: Fingerprint): Promise<Element | null> {
  const tag = fp.tagName || "*";
  let candidates: Element[];
  try {
    candidates = Array.from(document.querySelectorAll(tag));
  } catch {
    candidates = Array.from(document.querySelectorAll("*"));
  }
  if (candidates.length === 0) return null;

  // Pre-filter by text content to avoid running bippy on hundreds of nodes.
  const textFiltered = fp.textPreview
    ? candidates.filter((el) => textMatch(el, fp.textPreview))
    : candidates;

  const pool = textFiltered.length > 0 ? textFiltered : candidates;
  if (pool.length > 50) {
    // Too many — without text we can't disambiguate cheaply. Bail.
    return null;
  }

  let best: { el: Element; score: number } | null = null;
  for (const el of pool) {
    const score = await scoreCandidate(el, fp);
    if (score >= 0 && (!best || score > best.score)) {
      best = { el, score };
    }
  }
  // require a meaningful match — text alone (10) or source/displayName (5+)
  if (!best || best.score < 5) return null;
  return best.el;
}

async function scoreCandidate(el: Element, fp: Fingerprint): Promise<number> {
  let score = 0;
  if (fp.textPreview && textMatch(el, fp.textPreview)) score += 10;

  const sharedClasses = countSharedClasses(el, fp.classes);
  score += sharedClasses;

  const fiber = (getFiberFromHostInstance(el) as Fiber | null) ?? null;
  if (!fiber) return score;
  const composite = nearestComposite(fiber);
  if (!composite) return score;

  if (fp.displayName) {
    try {
      const name = getDisplayName(composite.type);
      if (name && name === fp.displayName) score += 5;
    } catch {
      // ignore
    }
  }

  if (fp.source?.file) {
    try {
      const src = await getSource(composite);
      const a = src?.fileName ? cleanFileName(src.fileName) : null;
      if (a && fileMatch(a, fp.source.file)) score += 8;
    } catch {
      // ignore
    }
  }

  return score;
}

function nearestComposite(fiber: Fiber): Fiber | null {
  let cur: Fiber | null = fiber;
  while (cur) {
    if (isCompositeFiber(cur)) return cur;
    cur = cur.return ?? null;
  }
  return null;
}

function textMatch(el: Element, preview: string): boolean {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!t || !preview) return false;
  if (t === preview) return true;
  // limit text length to avoid huge subtree matches
  const sampled = t.length > 400 ? t.slice(0, 400) : t;
  return sampled.includes(preview);
}

function countSharedClasses(el: Element, want: string[]): number {
  if (!want || want.length === 0) return 0;
  const have = new Set(
    (el.getAttribute("class") || "").split(/\s+/).filter(Boolean),
  );
  let n = 0;
  for (const c of want) if (have.has(c)) n++;
  return n;
}

function fileMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.endsWith(b)) return true;
  if (b.endsWith(a)) return true;
  return false;
}

function cleanFileName(name: string): string {
  let f = name;
  const q = f.indexOf("?");
  if (q !== -1) f = f.slice(0, q);
  try {
    const u = new URL(f);
    f = u.pathname;
  } catch {
    // not a URL
  }
  return f;
}
