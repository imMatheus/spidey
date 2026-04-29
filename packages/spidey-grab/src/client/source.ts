import {
  getFiberFromHostInstance,
  isCompositeFiber,
  getDisplayName,
  type Fiber,
} from "bippy";
import { getSource } from "bippy/source";
import type { ElementContext, SourceLocation } from "../protocol";

export interface ResolvedTarget {
  source: SourceLocation | null;
  context: ElementContext;
}

export async function resolveTarget(node: Element): Promise<ResolvedTarget> {
  const context = readDomContext(node);
  const fiber = getFiberFromHostInstance(node) as Fiber | null;
  if (!fiber) {
    return { source: null, context };
  }

  const composite = nearestComposite(fiber);
  if (composite) {
    context.displayName = safeDisplayName(composite);
  }

  const source = composite ? await safeGetSource(composite) : null;
  return { source, context };
}

function readDomContext(node: Element): ElementContext {
  const tagName = node.tagName || "div";
  const classes = (node.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean);
  const text = (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    tagName,
    classes,
    textPreview: text,
    displayName: null,
  };
}

function nearestComposite(fiber: Fiber): Fiber | null {
  let current: Fiber | null = fiber;
  while (current) {
    if (isCompositeFiber(current)) return current;
    current = current.return ?? null;
  }
  return null;
}

function safeDisplayName(fiber: Fiber): string | null {
  try {
    const name = getDisplayName(fiber.type);
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

async function safeGetSource(fiber: Fiber): Promise<SourceLocation | null> {
  try {
    const src = await getSource(fiber);
    if (!src || !src.fileName) return null;
    return {
      file: cleanFileName(src.fileName),
      line: src.lineNumber,
      column: src.columnNumber,
    };
  } catch {
    return null;
  }
}

function cleanFileName(name: string): string {
  let f = name;
  // strip query strings (?t=12345 added by Vite/dev servers)
  const q = f.indexOf("?");
  if (q !== -1) f = f.slice(0, q);
  // strip dev-server origin prefix
  try {
    const u = new URL(f);
    f = u.pathname;
  } catch {
    // not a URL, leave as-is
  }
  return f;
}
