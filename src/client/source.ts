import {
  getFiberFromHostInstance,
  isCompositeFiber,
  getDisplayName,
  type Fiber,
} from "bippy";
import type { ElementContext, SourceLocation } from "../protocol";

export interface ResolvedTarget {
  source: SourceLocation | null;
  context: ElementContext;
}

interface DebugSource {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
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

  const source = findElementSource(fiber);
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

// React's dev runtime annotates each JSX element with `__source` (via
// @babel/plugin-transform-react-jsx-source / Vite's react plugin), which
// surfaces on the fiber as `_debugSource`. That's the exact JSX call site of
// the element the user clicked — what we want.
//
// `bippy/source`'s getSource() is intentionally *not* used here: it returns
// where the surrounding composite component is *used*, not where the host
// element is defined.
function findElementSource(fiber: Fiber): SourceLocation | null {
  let current: Fiber | null = fiber;
  while (current) {
    const ds = readDebugSource(current);
    if (ds?.fileName) {
      return {
        file: cleanFileName(ds.fileName),
        line: ds.lineNumber,
        column: ds.columnNumber,
      };
    }
    current = current.return ?? null;
  }
  return null;
}

function readDebugSource(fiber: Fiber): DebugSource | null {
  const f = fiber as Fiber & { _debugSource?: DebugSource; alternate?: Fiber };
  if (f._debugSource?.fileName) return f._debugSource;
  const alt = f.alternate as (Fiber & { _debugSource?: DebugSource }) | undefined;
  if (alt?._debugSource?.fileName) return alt._debugSource;
  return null;
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
