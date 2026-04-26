import type { SpideyNode } from "@spidey/shared";

export type TreeNode = {
  /** Spidey node id — same value as data-spidey-id on the live element. */
  id: string;
  tag: string;
  classes: string[];
  domId?: string;
  /** Set when this element is the root of a captured React component
   *  instance (data-spidey-component attribute). */
  componentName?: string;
  /** First text child's value, lightly trimmed. Used to render previews
   *  in the layers tree. */
  textPreview?: string;
  children: TreeNode[];
};

const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template", "meta", "link"]);

/**
 * Walk a SpideyNode tree (the tile's captured-content body) and return a
 * tree of TreeNodes for the layers panel. Skips non-renderable tags and
 * unwraps the root <body> wrapper so the tree starts at the page's real
 * top-level elements.
 */
export function buildTree(root: SpideyNode | null): TreeNode[] {
  if (!root || root.kind !== "el") return [];
  const out: TreeNode[] = [];
  for (const child of root.children) {
    const node = walk(child);
    if (node) out.push(node);
  }
  return out;
}

function walk(n: SpideyNode): TreeNode | null {
  if (n.kind === "text") return null;
  if (SKIPPED_TAGS.has(n.tag)) return null;

  const children: TreeNode[] = [];
  let textPreview: string | undefined;
  for (const c of n.children) {
    if (c.kind === "text") {
      if (!textPreview) {
        const t = c.value.trim();
        if (t) textPreview = t.slice(0, 40);
      }
      continue;
    }
    const child = walk(c);
    if (child) children.push(child);
  }

  const classAttr = n.attrs.class ?? "";
  const classes = classAttr ? classAttr.split(/\s+/).filter(Boolean) : [];

  return {
    id: n.id,
    tag: n.tag,
    classes,
    domId: n.attrs.id || undefined,
    componentName: n.attrs["data-spidey-component"] ?? undefined,
    textPreview,
    children,
  };
}

/** Find a node by id in a TreeNode list; return the node and its ancestors. */
export function findNode(
  trees: TreeNode[],
  id: string,
): { node: TreeNode; ancestors: TreeNode[] } | null {
  const path: TreeNode[] = [];
  function recurse(nodes: TreeNode[]): TreeNode | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      path.push(n);
      const found = recurse(n.children);
      if (found) return found;
      path.pop();
    }
    return null;
  }
  const node = recurse(trees);
  return node ? { node, ancestors: [...path] } : null;
}

/** Walk to determine whether `descendant` is a descendant of (or equal to) `ancestor`. */
export function isDescendant(ancestor: TreeNode, descendantId: string): boolean {
  if (ancestor.id === descendantId) return true;
  return ancestor.children.some((c) => isDescendant(c, descendantId));
}
