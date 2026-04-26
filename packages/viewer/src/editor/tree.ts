import type { SpideyNode } from "@spidey/shared";

/** Generate a fresh node id for editor-inserted nodes. */
export function newId(): string {
  // Short prefix so it's obvious in the JSON which nodes were drawn vs.
  // captured. crypto.randomUUID is available on localhost (secure context).
  const r = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  return `u-${r.slice(0, 8)}`;
}

/** Walk; return the first node whose id matches. */
export function findById(
  root: SpideyNode | null,
  id: string,
): SpideyNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  if (root.kind === "text") return null;
  for (const c of root.children) {
    const found = findById(c, id);
    if (found) return found;
  }
  return null;
}

/** Walk; return parent of the matching node and its index in parent.children. */
export function findParent(
  root: SpideyNode | null,
  id: string,
): { parent: SpideyNode & { kind: "el" }; index: number } | null {
  if (!root || root.kind === "text") return null;
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === id) {
      return { parent: root, index: i };
    }
    const found = findParent(root.children[i], id);
    if (found) return found;
  }
  return null;
}

/** Returns a new tree with `target` replaced via the `update` callback.
 *  Structural sharing: only the path from root → target is cloned. */
export function updateNode(
  root: SpideyNode,
  id: string,
  update: (n: SpideyNode) => SpideyNode,
): SpideyNode {
  if (root.id === id) return update(root);
  if (root.kind === "text") return root;
  let changed = false;
  const newChildren: SpideyNode[] = [];
  for (const c of root.children) {
    const next = updateNode(c, id, update);
    if (next !== c) changed = true;
    newChildren.push(next);
  }
  if (!changed) return root;
  return { ...root, children: newChildren };
}

/** Remove all nodes with ids in the set. Returns a new tree (root never
 *  removed; if its id is in the set we no-op). */
export function removeIds(root: SpideyNode, ids: Set<string>): SpideyNode {
  if (root.kind === "text") return root;
  const filtered = root.children.filter((c) => !ids.has(c.id));
  const next = filtered.map((c) => removeIds(c, ids));
  if (next.length === root.children.length &&
      next.every((c, i) => c === root.children[i])) {
    return root;
  }
  return { ...root, children: next };
}

/** Insert a node as a child of the given parent at the given index. */
export function insertChild(
  root: SpideyNode,
  parentId: string,
  index: number,
  node: SpideyNode,
): SpideyNode {
  return updateNode(root, parentId, (p) => {
    if (p.kind !== "el") return p;
    const idx = Math.max(0, Math.min(index, p.children.length));
    const next = [...p.children];
    next.splice(idx, 0, node);
    return { ...p, children: next };
  });
}

/** Move an existing node to a new parent + index. Cycle-safe: no-op if the
 *  target parent is a descendant of the moving node. */
export function moveNode(
  root: SpideyNode,
  nodeId: string,
  newParentId: string,
  newIndex: number,
): SpideyNode {
  if (nodeId === newParentId) return root;
  const moving = findById(root, nodeId);
  if (!moving || moving.kind === "text") {
    // text nodes can move too — but check cycle only matters for elements
  }
  if (moving) {
    // descendant check: can't move a node into its own subtree
    if (findById(moving, newParentId)) return root;
  }

  const found = findParent(root, nodeId);
  if (!found) return root;
  const movingNode = found.parent.children[found.index];

  // remove first
  let next = removeIds(root, new Set([nodeId]));
  // Re-find target parent in the new tree (its children shifted if same parent)
  next = updateNode(next, newParentId, (p) => {
    if (p.kind !== "el") return p;
    const idx = Math.max(0, Math.min(newIndex, p.children.length));
    const cs = [...p.children];
    cs.splice(idx, 0, movingNode);
    return { ...p, children: cs };
  });
  return next;
}

/**
 * Find the first descendant element whose attrs[data-spidey-component]
 * equals `componentName`. Used to locate the master root inside a component
 * preview tile (the wrapper div sits between the body and the actual
 * rendered component).
 */
export function findComponentRoot(
  root: SpideyNode | null,
  componentName: string,
): SpideyNode | null {
  if (!root) return null;
  if (root.kind === "el") {
    if (root.attrs["data-spidey-component"] === componentName) return root;
    for (const c of root.children) {
      const found = findComponentRoot(c, componentName);
      if (found) return found;
    }
  }
  return null;
}

/**
 * All descendants of `root` whose attrs[data-spidey-component] === name.
 * Used to enumerate every instance of a component within a route tile.
 */
export function findAllInstances(
  root: SpideyNode | null,
  componentName: string,
): SpideyNode[] {
  const out: SpideyNode[] = [];
  function walk(n: SpideyNode) {
    if (n.kind === "el") {
      if (n.attrs["data-spidey-component"] === componentName) out.push(n);
      for (const c of n.children) walk(c);
    }
  }
  if (root) walk(root);
  return out;
}

/**
 * Path from `root` to the node with `targetId`, expressed as a sequence of
 * child indices. Counts both element and text children — that count is
 * stable across master/instances because they were rendered from the same
 * component code with the same conditional-rendering decisions (modulo
 * prop-driven branches, which we accept may not match: see walkPath).
 *
 * Returns null when target is not found in the subtree.
 */
export function pathFromTo(root: SpideyNode, targetId: string): number[] | null {
  if (root.id === targetId) return [];
  if (root.kind === "text") return null;
  for (let i = 0; i < root.children.length; i++) {
    const sub = pathFromTo(root.children[i], targetId);
    if (sub) return [i, ...sub];
  }
  return null;
}

/**
 * Walk a sequence of child indices starting from `root`. Returns null when
 * any index is out of bounds — meaning the instance's structure diverged
 * from the master's at that point (e.g. a conditional render). Edits from
 * the master skip those instances silently.
 */
export function walkPath(root: SpideyNode, path: number[]): SpideyNode | null {
  let cur: SpideyNode = root;
  for (const idx of path) {
    if (cur.kind !== "el") return null;
    if (idx >= cur.children.length || idx < 0) return null;
    cur = cur.children[idx];
  }
  return cur;
}

/**
 * For a given route-tile tree and a target node id, return the nearest
 * ancestor (or the node itself) that is a component-instance root, plus
 * the component name. Returns null when the node is not inside any
 * instance — meaning normal editing rules apply.
 */
export function findInstanceAncestor(
  root: SpideyNode | null,
  targetId: string,
): { instance: SpideyNode & { kind: "el" }; componentName: string } | null {
  if (!root) return null;
  let result:
    | { instance: SpideyNode & { kind: "el" }; componentName: string }
    | null = null;
  function walk(n: SpideyNode, ancestor: { instance: SpideyNode & { kind: "el" }; componentName: string } | null): boolean {
    let next = ancestor;
    if (n.kind === "el") {
      const compName = n.attrs["data-spidey-component"];
      if (compName) next = { instance: n, componentName: compName };
    }
    if (n.id === targetId) {
      result = next;
      return true;
    }
    if (n.kind === "el") {
      for (const c of n.children) {
        if (walk(c, next)) return true;
      }
    }
    return false;
  }
  walk(root, null);
  return result;
}

/** Deep-clone a subtree assigning fresh ids to every node. */
export function cloneWithNewIds(node: SpideyNode): SpideyNode {
  if (node.kind === "text") {
    return { id: newId(), kind: "text", value: node.value };
  }
  return {
    id: newId(),
    kind: "el",
    tag: node.tag,
    attrs: { ...node.attrs },
    style: { ...node.style },
    children: node.children.map(cloneWithNewIds),
  };
}
