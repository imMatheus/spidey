export type TreeNode = {
  id: string;
  ref: HTMLElement;
  tag: string;
  classes: string[];
  domId?: string;
  /** Set when this element is the root of a captured React component
   *  instance (data-spidey-component attribute). */
  componentName?: string;
  children: TreeNode[];
};

const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "META", "LINK"]);

/**
 * Walk a shadow root (or any element) and return a tree of HTMLElements,
 * skipping non-renderable nodes. Each node gets a stable path-based id.
 */
export function buildTree(root: ShadowRoot | HTMLElement): TreeNode[] {
  const out: TreeNode[] = [];
  let i = 0;
  for (const child of Array.from(root.children) as HTMLElement[]) {
    const node = walk(child, `${i}`);
    if (node) out.push(node);
    i++;
  }
  return out;
}

function walk(el: HTMLElement, path: string): TreeNode | null {
  if (SKIPPED_TAGS.has(el.tagName)) return null;
  const children: TreeNode[] = [];
  let i = 0;
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const c = walk(child, `${path}.${i}`);
    if (c) children.push(c);
    i++;
  }
  return {
    id: path,
    ref: el,
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
    domId: el.id || undefined,
    componentName: el.getAttribute("data-spidey-component") ?? undefined,
    children,
  };
}

/**
 * Find a node within a tree by element ref. Returns the node and its ancestor
 * chain (root-most first).
 */
export function findNode(
  trees: TreeNode[],
  el: HTMLElement,
): { node: TreeNode; ancestors: TreeNode[] } | null {
  const path: TreeNode[] = [];
  function recurse(nodes: TreeNode[]): TreeNode | null {
    for (const n of nodes) {
      if (n.ref === el) return n;
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
