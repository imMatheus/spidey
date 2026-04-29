import type { SpideyNode } from "@spidey/shared";
import {
  cloneWithNewIds,
  findAllInstances,
  findById,
  findComponentRoot,
  findParent,
  insertChild,
  moveNode,
  newId,
  pathFromTo,
  removeIds,
  stampRootId,
  updateNode,
  walkPath,
} from "./tree";

export type Tool = "select" | "text" | "rect" | "image" | "hand";

/** Per-tile metadata the reducer needs to decide whether an edit on tile X
 *  should propagate to other tiles (component master → instances). */
export type TileMeta = {
  kind: "route" | "component";
  /** Component name when kind === "component". */
  componentName?: string;
};

export type EditorState = {
  tool: Tool;
  /** tile-id → tree (mirrors SpideyDocument.tiles[*].tree). null means a
   *  failed-capture tile or pre-init. */
  tileTrees: Record<string, SpideyNode | null>;
  /** tile-id → tree as it was at session-init / generate time. The handoff
   *  changeset is `(baseline → tileTrees)`. Frozen reference: never mutated
   *  by the reducer; only `init` replaces it. */
  baselineTrees: Record<string, SpideyNode | null>;
  /** Bag of metadata keyed by tile id; the reducer uses it to discover
   *  master tiles + their component name. */
  tilesMeta: Record<string, TileMeta>;
  /** monotonically incremented on every mutation; used as a key by consumers
   *  (Tile re-mount, Inspector re-resolve) without needing deep equality. */
  rev: number;
  history: HistoryEntry[];
  future: HistoryEntry[];
  /** Append-only log of user gestures since session init. Drives the
   *  agent-handoff prompt: each record carries the originating action and
   *  every tile it mutated, so master→instance propagation collapses to
   *  one entry instead of N. Cleared by `init` and `clearChangeLog`. */
  changeLog: GestureRecord[];
  dirty: boolean;
  /** session in-memory clipboard (cut/copy → paste). Stores the SpideyNode
   *  subtree as it was at copy time. */
  clipboard: SpideyNode | null;
};

export type GestureRecord = {
  id: string;
  at: number;
  /** The originating EditAction (without `undo`/`redo` — those manipulate the
   *  log itself). Stored for fidelity in the prompt. */
  action: Exclude<EditAction, { type: "undo" } | { type: "redo" } | { type: "init" } | { type: "setTool" } | { type: "markSaved" } | { type: "clearChangeLog" }>;
  /** Tile ids actually mutated by this gesture (1 for direct, N for
   *  master→instance propagation). */
  affectedTiles: string[];
};

type TileChange = {
  tileId: string;
  prev: SpideyNode | null;
  next: SpideyNode | null;
};

/** A single user gesture may touch multiple tiles (master + N instances).
 *  Each entry is the array of (prev, next) trees affected, applied/reverted
 *  together so undo is one step. The `gesture` slot mirrors the same record
 *  appended to `changeLog` so undo/redo can pop/push it without rebuilding. */
type HistoryEntry = {
  changes: TileChange[];
  gesture: GestureRecord;
};

const HISTORY_CAP = 200;

export type EditAction =
  | {
      type: "init";
      tileTrees: Record<string, SpideyNode | null>;
      tilesMeta: Record<string, TileMeta>;
      /** When omitted (no sidecar) the reducer copies tileTrees so the
       *  changeset starts empty. */
      baselineTrees?: Record<string, SpideyNode | null>;
    }
  | { type: "setTool"; tool: Tool }
  | {
      /** Replace a tile's whole tree atomically — used by the recapture
       *  flow when a master tile is re-rendered with new propsUsed.
       *  Recorded in history so undo restores the prior tree. */
      type: "replaceTileTree";
      tileId: string;
      tree: SpideyNode;
    }
  | {
      /** Replace a single subtree within a tile — used by the
       *  instance-recapture flow when an instance's props are edited on
       *  a route tile. The new subtree gets the existing nodeId on its
       *  root (so selection stays valid) and fresh ids on descendants
       *  (so they don't collide with anything elsewhere in the tree).
       *  Recorded in history so undo restores the prior subtree. */
      type: "replaceSubtree";
      tileId: string;
      nodeId: string;
      subtree: SpideyNode;
    }
  | { type: "setText"; tileId: string; nodeId: string; text: string }
  | {
      type: "setAttr";
      tileId: string;
      nodeId: string;
      name: string;
      value: string | null;
    }
  | {
      type: "setStyle";
      tileId: string;
      nodeId: string;
      prop: string;
      value: string | null;
    }
  | {
      type: "insertNode";
      tileId: string;
      parentId: string;
      index: number;
      node: SpideyNode;
    }
  | { type: "removeNode"; tileId: string; nodeId: string }
  | { type: "duplicateNode"; tileId: string; nodeId: string }
  | {
      type: "moveNode";
      tileId: string;
      nodeId: string;
      newParentId: string;
      newIndex: number;
    }
  | { type: "copyNode"; tileId: string; nodeId: string }
  | { type: "cutNode"; tileId: string; nodeId: string }
  | {
      type: "pasteAsChild";
      tileId: string;
      parentId: string;
    }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "markSaved" }
  /** Wipe the gesture log (e.g. after a successful agent handoff). Does
   *  NOT touch tileTrees or baselineTrees — those reset on the next `init`
   *  when the user re-runs `spidey generate`. */
  | { type: "clearChangeLog" };

export function makeInitialState(
  tileTrees: Record<string, SpideyNode | null>,
  tilesMeta: Record<string, TileMeta> = {},
  baselineTrees?: Record<string, SpideyNode | null>,
): EditorState {
  return {
    tool: "select",
    tileTrees,
    baselineTrees: baselineTrees ?? { ...tileTrees },
    tilesMeta,
    rev: 0,
    history: [],
    future: [],
    changeLog: [],
    dirty: false,
    clipboard: null,
  };
}

export function reducer(state: EditorState, action: EditAction): EditorState {
  switch (action.type) {
    case "init":
      return {
        ...state,
        tileTrees: action.tileTrees,
        baselineTrees: action.baselineTrees ?? { ...action.tileTrees },
        tilesMeta: action.tilesMeta,
        rev: state.rev + 1,
        history: [],
        future: [],
        changeLog: [],
        dirty: false,
      };

    case "setTool":
      return state.tool === action.tool ? state : { ...state, tool: action.tool };

    case "setText": {
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      const next = updateNode(prev, action.nodeId, (n) => {
        if (n.kind !== "text") return n;
        return { ...n, value: action.text };
      });
      return commitChanges(state, [{ tileId: action.tileId, prev, next }], action);
    }

    case "replaceTileTree": {
      const prev = state.tileTrees[action.tileId];
      // First-time replacement on a tile we don't have yet (shouldn't
      // happen in practice — recapture is master-only — but be safe).
      if (prev === action.tree) return state;
      return commitChanges(
        state,
        [{ tileId: action.tileId, prev: prev ?? null, next: action.tree }],
        action,
      );
    }

    case "replaceSubtree": {
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      // Stamp the existing node id on the new root + fresh ids on all
      // descendants. Preserving the root id keeps the user's selection
      // valid; fresh ids on descendants avoid colliding with anything
      // already in the tree.
      const stamped = stampRootId(action.subtree, action.nodeId);
      const next = updateNode(prev, action.nodeId, () => stamped);
      if (next === prev) return state;
      return commitChanges(
        state,
        [{ tileId: action.tileId, prev, next }],
        action,
      );
    }

    case "setAttr":
    case "setStyle": {
      const changes = computePropagatedChanges(state, action);
      return changes.length ? commitChanges(state, changes, action) : state;
    }

    case "insertNode": {
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      const next = insertChild(prev, action.parentId, action.index, action.node);
      return commitChanges(state, [{ tileId: action.tileId, prev, next }], action);
    }

    case "removeNode": {
      const prev = state.tileTrees[action.tileId];
      if (!prev || prev.id === action.nodeId) return state; // can't remove root
      const next = removeIds(prev, new Set([action.nodeId]));
      return commitChanges(state, [{ tileId: action.tileId, prev, next }], action);
    }

    case "duplicateNode": {
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      const found = findParent(prev, action.nodeId);
      if (!found) return state;
      const original = found.parent.children[found.index];
      const dup = cloneWithNewIds(original);
      const next = insertChild(prev, found.parent.id, found.index + 1, dup);
      return commitChanges(state, [{ tileId: action.tileId, prev, next }], action);
    }

    case "moveNode": {
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      const next = moveNode(prev, action.nodeId, action.newParentId, action.newIndex);
      if (next === prev) return state;
      return commitChanges(state, [{ tileId: action.tileId, prev, next }], action);
    }

    case "copyNode": {
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      const node = findById(prev, action.nodeId);
      if (!node) return state;
      return { ...state, clipboard: cloneWithNewIds(node) };
    }

    case "cutNode": {
      const prev = state.tileTrees[action.tileId];
      if (!prev || prev.id === action.nodeId) return state;
      const node = findById(prev, action.nodeId);
      if (!node) return state;
      const clipboard = cloneWithNewIds(node);
      const next = removeIds(prev, new Set([action.nodeId]));
      const after = commitChanges(
        state,
        [{ tileId: action.tileId, prev, next }],
        action,
      );
      return { ...after, clipboard };
    }

    case "pasteAsChild": {
      if (!state.clipboard) return state;
      const prev = state.tileTrees[action.tileId];
      if (!prev) return state;
      const fresh = cloneWithNewIds(state.clipboard);
      const parent = findById(prev, action.parentId);
      if (!parent || parent.kind !== "el") return state;
      const next = insertChild(prev, action.parentId, parent.children.length, fresh);
      return commitChanges(state, [{ tileId: action.tileId, prev, next }], action);
    }

    case "undo": {
      const last = state.history[state.history.length - 1];
      if (!last) return state;
      const newHistory = state.history.slice(0, -1);
      const nextTrees = { ...state.tileTrees };
      for (const c of last.changes) nextTrees[c.tileId] = c.prev;
      // The gesture is also unwound from the change log so the handoff
      // changeset reflects only the user's currently-visible state.
      const newLog = state.changeLog.filter((g) => g.id !== last.gesture.id);
      return {
        ...state,
        tileTrees: nextTrees,
        history: newHistory,
        future: [...state.future, last],
        changeLog: newLog,
        rev: state.rev + 1,
        dirty: true,
      };
    }

    case "redo": {
      const last = state.future[state.future.length - 1];
      if (!last) return state;
      const newFuture = state.future.slice(0, -1);
      const nextTrees = { ...state.tileTrees };
      for (const c of last.changes) nextTrees[c.tileId] = c.next;
      return {
        ...state,
        tileTrees: nextTrees,
        history: [...state.history, last],
        future: newFuture,
        changeLog: [...state.changeLog, last.gesture],
        rev: state.rev + 1,
        dirty: true,
      };
    }

    case "markSaved":
      return state.dirty ? { ...state, dirty: false } : state;

    case "clearChangeLog":
      return state.changeLog.length === 0
        ? state
        : { ...state, changeLog: [], history: [], future: [] };
  }
}

/**
 * Compute the (tileId, prev, next) changes for a single setStyle / setAttr
 * action, including propagation to component instances when the edit is on
 * a master tile + at-or-below the master root.
 */
function computePropagatedChanges(
  state: EditorState,
  action:
    | {
        type: "setStyle";
        tileId: string;
        nodeId: string;
        prop: string;
        value: string | null;
      }
    | {
        type: "setAttr";
        tileId: string;
        nodeId: string;
        name: string;
        value: string | null;
      },
): TileChange[] {
  const prev = state.tileTrees[action.tileId];
  if (!prev) return [];
  const next = applyAttrOrStyle(prev, action);
  if (next === prev) return [];

  const out: TileChange[] = [{ tileId: action.tileId, prev, next }];

  // Propagation only applies when:
  // 1. The edited tile is a component master tile.
  // 2. The edited node is at-or-below the master's component root (i.e.
  //    inside the actual component, not on the wrapper div around it).
  const meta = state.tilesMeta[action.tileId];
  if (meta?.kind === "component" && meta.componentName) {
    const masterRoot = findComponentRoot(prev, meta.componentName);
    if (masterRoot) {
      const path = pathFromTo(masterRoot, action.nodeId);
      if (path !== null) {
        // Walk all OTHER tiles, find instances of this component, and apply
        // the same change at the same path. Skips silently when an
        // instance's structure diverges.
        for (const [otherId, otherMeta] of Object.entries(state.tilesMeta)) {
          if (otherId === action.tileId) continue;
          // Other component-master tiles can also host instances (e.g. a
          // <Card> master that renders a <Button> inside) — push to them
          // too so nested-component previews stay coherent.
          void otherMeta;
          const otherTree = state.tileTrees[otherId];
          if (!otherTree) continue;
          const instances = findAllInstances(otherTree, meta.componentName);
          if (instances.length === 0) continue;
          let nextOther: SpideyNode | null = otherTree;
          for (const inst of instances) {
            const target = walkPath(inst, path);
            if (!target) continue;
            nextOther = applyAttrOrStyle(nextOther!, {
              ...action,
              nodeId: target.id,
            } as typeof action);
          }
          if (nextOther !== otherTree) {
            out.push({ tileId: otherId, prev: otherTree, next: nextOther });
          }
        }
      }
    }
  }

  return out;
}

function applyAttrOrStyle(
  tree: SpideyNode,
  action:
    | {
        type: "setStyle";
        nodeId: string;
        prop: string;
        value: string | null;
      }
    | {
        type: "setAttr";
        nodeId: string;
        name: string;
        value: string | null;
      },
): SpideyNode {
  if (action.type === "setStyle") {
    return updateNode(tree, action.nodeId, (n) => {
      if (n.kind !== "el") return n;
      const style = { ...n.style };
      if (action.value === null || action.value === "") delete style[action.prop];
      else style[action.prop] = action.value;
      return { ...n, style };
    });
  }
  return updateNode(tree, action.nodeId, (n) => {
    if (n.kind !== "el") return n;
    const attrs = { ...n.attrs };
    if (action.value === null) delete attrs[action.name];
    else attrs[action.name] = action.value;
    return { ...n, attrs };
  });
}

function commitChanges(
  state: EditorState,
  changes: TileChange[],
  /** The originating action — recorded on the GestureRecord. */
  action: GestureRecord["action"],
): EditorState {
  if (changes.length === 0) return state;
  const nextTrees = { ...state.tileTrees };
  const affected: string[] = [];
  let anyChanged = false;
  for (const c of changes) {
    if (c.prev === c.next) continue;
    nextTrees[c.tileId] = c.next;
    affected.push(c.tileId);
    anyChanged = true;
  }
  if (!anyChanged) return state;
  const gesture: GestureRecord = {
    id: newId(),
    at: Date.now(),
    action,
    affectedTiles: affected,
  };
  const entry: HistoryEntry = { changes, gesture };
  const history = [...state.history, entry];
  if (history.length > HISTORY_CAP) history.splice(0, history.length - HISTORY_CAP);
  const changeLog = [...state.changeLog, gesture];
  if (changeLog.length > HISTORY_CAP)
    changeLog.splice(0, changeLog.length - HISTORY_CAP);
  return {
    ...state,
    tileTrees: nextTrees,
    history,
    future: [],
    changeLog,
    rev: state.rev + 1,
    dirty: true,
  };
}

export { newId };
