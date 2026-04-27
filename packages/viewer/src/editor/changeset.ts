import type { SpideyDocument, SpideyNode } from "@spidey/shared";
import type { GestureRecord, TileMeta } from "./state";
import { findById } from "./tree";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type NodeLineage = {
  /** Nearest ancestor (or self) with data-spidey-component, in the
   *  tile this change applies to. */
  componentName?: string;
  /** Source file from doc.components catalog. */
  componentFile?: string;
  /** Snapshot of the runtime props on the instance root, parsed from
   *  data-spidey-props. */
  componentProps?: Record<string, unknown>;
  /** Best-guess source file for the route this tile represents. */
  routeFile?: string;
  /** Class names from the change's nearest classed ancestor inwards.
   *  Lets the agent decide between editing the CSS rule vs. inlining. */
  classChain?: string[];
  /** Human-readable label — first text descendant of the changed node,
   *  truncated. Useful when nodeId is opaque. */
  textContext?: string;
};

export type SquashedChange =
  | {
      kind: "style";
      nodeId: string;
      prop: string;
      before: string | null;
      after: string | null;
      lineage: NodeLineage;
      /** Source tile this change originated on (the master, if collapsed). */
      tileId: string;
    }
  | {
      kind: "attr";
      nodeId: string;
      name: string;
      before: string | null;
      after: string | null;
      lineage: NodeLineage;
      tileId: string;
    }
  | {
      kind: "text";
      nodeId: string;
      before: string | null;
      after: string;
      lineage: NodeLineage;
      tileId: string;
    }
  | {
      kind: "insert";
      node: SpideyNode;
      parentId: string;
      index: number;
      lineage: NodeLineage;
      tileId: string;
    }
  | {
      kind: "remove";
      nodeId: string;
      lineage: NodeLineage;
      tileId: string;
    }
  | {
      kind: "move";
      nodeId: string;
      newParentId: string;
      newIndex: number;
      lineage: NodeLineage;
      tileId: string;
    }
  | {
      kind: "duplicate";
      sourceNodeId: string;
      lineage: NodeLineage;
      tileId: string;
    }
  | {
      kind: "paste";
      parentId: string;
      lineage: NodeLineage;
      tileId: string;
    };

export type ComponentScope = {
  componentName: string;
  file?: string;
  /** How many tiles outside the master this change reached (0 for a
   *  master-tile-only edit; ≥1 for propagated edits). */
  instanceCount: number;
  changes: SquashedChange[];
};

export type TileScope = {
  tileId: string;
  tileLabel: string; // route path or component name
  sourceHints: string[]; // candidate source files for the agent to consult
  changes: SquashedChange[];
};

export type ChangeSummary = {
  byComponent: ComponentScope[];
  byTile: TileScope[];
  /** Newly-drawn user primitives (id starts with `u-`) inserted into a
   *  captured tree. Surfaced separately so the agent can decide whether to
   *  add equivalent JSX or skip with a reason. */
  primitives: Array<{
    tileId: string;
    tileLabel: string;
    node: SpideyNode;
    insertedUnder: NodeLineage;
  }>;
  totalCount: number;
  /** True when there's no baseline to compare against (sidecar 404'd).
   *  Surfaced in the UI as a banner. */
  baselineMissing?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Public entry points                                               */
/* ------------------------------------------------------------------ */

export function summarize(
  log: GestureRecord[],
  baseline: Record<string, SpideyNode | null>,
  current: Record<string, SpideyNode | null>,
  tilesMeta: Record<string, TileMeta>,
  doc: SpideyDocument,
  options: { baselineMissing?: boolean } = {},
): ChangeSummary {
  // Phase 1 — derive squashed changes.
  // Primary source: the gesture log (carries intent + originating action).
  // Fallback: when log is empty but baseline ≠ current (e.g. after viewer
  // reload), walk the trees by id to recover the diff.
  let raw: SquashedChange[];
  if (log.length > 0) {
    raw = squashFromLog(log, baseline, current, tilesMeta, doc);
  } else {
    raw = squashFromDiff(baseline, current, tilesMeta, doc);
  }

  // Phase 2 — group component-scoped vs tile-scoped vs primitive.
  const byComponent = new Map<string, ComponentScope>();
  const byTile = new Map<string, TileScope>();
  const primitives: ChangeSummary["primitives"] = [];

  for (const c of raw) {
    if (c.kind === "insert" && c.node.id.startsWith("u-")) {
      primitives.push({
        tileId: c.tileId,
        tileLabel: tileLabel(c.tileId, doc, tilesMeta),
        node: c.node,
        insertedUnder: c.lineage,
      });
      continue;
    }

    const meta = tilesMeta[c.tileId];
    const isMasterTile = meta?.kind === "component" && !!meta.componentName;
    if (isMasterTile && meta!.componentName) {
      const compName = meta!.componentName!;
      let bucket = byComponent.get(compName);
      if (!bucket) {
        bucket = {
          componentName: compName,
          file: c.lineage.componentFile,
          instanceCount: countInstanceTiles(compName, current, tilesMeta),
          changes: [],
        };
        byComponent.set(compName, bucket);
      }
      bucket.changes.push(c);
      continue;
    }

    let bucket = byTile.get(c.tileId);
    if (!bucket) {
      bucket = {
        tileId: c.tileId,
        tileLabel: tileLabel(c.tileId, doc, tilesMeta),
        sourceHints: sourceHintsForTile(c.tileId, doc, tilesMeta),
        changes: [],
      };
      byTile.set(c.tileId, bucket);
    }
    bucket.changes.push(c);
  }

  return {
    byComponent: Array.from(byComponent.values()),
    byTile: Array.from(byTile.values()),
    primitives,
    totalCount:
      Array.from(byComponent.values()).reduce((n, c) => n + c.changes.length, 0) +
      Array.from(byTile.values()).reduce((n, t) => n + t.changes.length, 0) +
      primitives.length,
    baselineMissing: options.baselineMissing,
  };
}

const PROMPT_CAP = 50;

export function renderPrompt(
  summary: ChangeSummary,
  doc: SpideyDocument,
  agent: "claude" | "codex",
): string {
  void agent; // currently identical for both

  const lines: string[] = [];
  lines.push(
    "You are applying visual design edits from the Spidey editor to this project's source code.",
  );
  lines.push("");

  // Project header
  const projectRoot = doc.project?.root ?? "(unknown)";
  const framework = doc.project?.framework ?? "unknown";
  lines.push("## Project");
  lines.push(`- Framework: ${framework}`);
  lines.push(`- Root: ${projectRoot}`);
  if (doc.components && doc.components.length > 0) {
    lines.push("- Components catalog:");
    for (const c of doc.components) {
      lines.push(`  - ${c.name}  →  ${c.file}`);
    }
  }
  lines.push("");

  let entryCount = 0;
  const cap = PROMPT_CAP;

  // Component-scoped changes first — these are the high-leverage edits.
  if (summary.byComponent.length > 0) {
    lines.push("## Component-scoped edits");
    for (const comp of summary.byComponent) {
      if (entryCount >= cap) break;
      const fileBit = comp.file ? `  (${comp.file})` : "";
      const instanceBit =
        comp.instanceCount > 0
          ? `  — propagates to ${comp.instanceCount} instance${comp.instanceCount === 1 ? "" : "s"}`
          : "";
      lines.push(`### <${comp.componentName}>${fileBit}${instanceBit}`);
      for (const ch of comp.changes) {
        if (entryCount >= cap) {
          lines.push(`(… ${comp.changes.length - (entryCount - 0)} more in this component, omitted; ask for the rest)`);
          break;
        }
        lines.push("- " + describeChange(ch));
        entryCount++;
      }
      lines.push("");
    }
  }

  // Tile-scoped (route or instance-only) changes.
  if (summary.byTile.length > 0 && entryCount < cap) {
    lines.push("## Tile-scoped edits");
    for (const tile of summary.byTile) {
      if (entryCount >= cap) break;
      lines.push(`### ${tile.tileLabel}`);
      if (tile.sourceHints.length > 0) {
        lines.push(`Source hints: ${tile.sourceHints.join(", ")}`);
      }
      for (const ch of tile.changes) {
        if (entryCount >= cap) break;
        lines.push("- " + describeChange(ch));
        entryCount++;
      }
      lines.push("");
    }
  }

  // User-drawn primitives.
  if (summary.primitives.length > 0 && entryCount < cap) {
    lines.push("## User-drawn primitives");
    for (const p of summary.primitives) {
      if (entryCount >= cap) break;
      lines.push(
        `- on ${p.tileLabel}: ${describePrimitive(p.node)} (under ${describeLineage(p.insertedUnder)})`,
      );
      entryCount++;
    }
    lines.push("");
  }

  if (summary.totalCount > cap) {
    lines.push(
      `(${summary.totalCount - cap} more edit${summary.totalCount - cap === 1 ? "" : "s"} not shown; reply asking for the rest if needed)`,
    );
    lines.push("");
  }

  lines.push("## Constraints");
  lines.push(
    "- For component-scoped edits, modify the component source file. Do not inline overrides at every call site.",
  );
  lines.push(
    "- For tile-scoped edits, prefer source modification at the call site; introduce a new prop only if multiple call sites would benefit.",
  );
  lines.push(
    "- If an edit changes an inline style on something whose original visual came from a CSS class, decide between editing the CSS rule, overriding inline at the call site, or leaving as-is and reporting why.",
  );
  lines.push("- Preserve all prop values and content not mentioned in the edit list.");
  lines.push("- Do not run any commands, do not commit. Report applied vs skipped.");
  lines.push(
    "- The Spidey JSON is a captured snapshot — use it only as reference if helpful; the source files are the ground truth.",
  );

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Squash from gesture log                                           */
/* ------------------------------------------------------------------ */

function squashFromLog(
  log: GestureRecord[],
  baseline: Record<string, SpideyNode | null>,
  current: Record<string, SpideyNode | null>,
  tilesMeta: Record<string, TileMeta>,
  doc: SpideyDocument,
): SquashedChange[] {
  // Same (tileId, nodeId, prop|name|"text") keeps the most recent action's
  // "after" value. We resolve before/after from the trees at the end so
  // values are accurate post-undo/redo.
  type Key = string;
  const styleSeen = new Map<Key, { tileId: string; nodeId: string; prop: string }>();
  const attrSeen = new Map<Key, { tileId: string; nodeId: string; name: string }>();
  const textSeen = new Map<Key, { tileId: string; nodeId: string }>();
  const structural: SquashedChange[] = [];

  for (const g of log) {
    const a = g.action;
    // Each gesture's `affectedTiles` lists every tile the reducer mutated.
    // For style/attr propagated to instances, only the master change makes
    // it into the prompt — instance copies are implied. We keep the
    // primary tileId from the originating action.
    if (a.type === "setStyle") {
      styleSeen.set(`${a.tileId}::${a.nodeId}::${a.prop}`, {
        tileId: a.tileId,
        nodeId: a.nodeId,
        prop: a.prop,
      });
    } else if (a.type === "setAttr") {
      attrSeen.set(`${a.tileId}::${a.nodeId}::${a.name}`, {
        tileId: a.tileId,
        nodeId: a.nodeId,
        name: a.name,
      });
    } else if (a.type === "setText") {
      textSeen.set(`${a.tileId}::${a.nodeId}`, {
        tileId: a.tileId,
        nodeId: a.nodeId,
      });
    } else if (a.type === "insertNode") {
      structural.push({
        kind: "insert",
        tileId: a.tileId,
        node: a.node,
        parentId: a.parentId,
        index: a.index,
        lineage: lineageFor(current, a.tileId, a.parentId, tilesMeta, doc),
      });
    } else if (a.type === "removeNode") {
      structural.push({
        kind: "remove",
        tileId: a.tileId,
        nodeId: a.nodeId,
        lineage: lineageFor(baseline, a.tileId, a.nodeId, tilesMeta, doc),
      });
    } else if (a.type === "moveNode") {
      structural.push({
        kind: "move",
        tileId: a.tileId,
        nodeId: a.nodeId,
        newParentId: a.newParentId,
        newIndex: a.newIndex,
        lineage: lineageFor(current, a.tileId, a.nodeId, tilesMeta, doc),
      });
    } else if (a.type === "duplicateNode") {
      structural.push({
        kind: "duplicate",
        tileId: a.tileId,
        sourceNodeId: a.nodeId,
        lineage: lineageFor(current, a.tileId, a.nodeId, tilesMeta, doc),
      });
    } else if (a.type === "cutNode") {
      structural.push({
        kind: "remove",
        tileId: a.tileId,
        nodeId: a.nodeId,
        lineage: lineageFor(baseline, a.tileId, a.nodeId, tilesMeta, doc),
      });
    } else if (a.type === "pasteAsChild") {
      structural.push({
        kind: "paste",
        tileId: a.tileId,
        parentId: a.parentId,
        lineage: lineageFor(current, a.tileId, a.parentId, tilesMeta, doc),
      });
    }
    // copyNode is editor-only; nothing to log.
  }

  const out: SquashedChange[] = [];

  for (const k of styleSeen.values()) {
    const before = readStyleValue(baseline[k.tileId], k.nodeId, k.prop);
    const after = readStyleValue(current[k.tileId], k.nodeId, k.prop);
    if (before === after) continue;
    out.push({
      kind: "style",
      tileId: k.tileId,
      nodeId: k.nodeId,
      prop: k.prop,
      before,
      after,
      lineage: lineageFor(current, k.tileId, k.nodeId, tilesMeta, doc),
    });
  }
  for (const k of attrSeen.values()) {
    const before = readAttrValue(baseline[k.tileId], k.nodeId, k.name);
    const after = readAttrValue(current[k.tileId], k.nodeId, k.name);
    if (before === after) continue;
    out.push({
      kind: "attr",
      tileId: k.tileId,
      nodeId: k.nodeId,
      name: k.name,
      before,
      after,
      lineage: lineageFor(current, k.tileId, k.nodeId, tilesMeta, doc),
    });
  }
  for (const k of textSeen.values()) {
    const before = readTextValue(baseline[k.tileId], k.nodeId);
    const after = readTextValue(current[k.tileId], k.nodeId);
    if (before === after) continue;
    out.push({
      kind: "text",
      tileId: k.tileId,
      nodeId: k.nodeId,
      before,
      after: after ?? "",
      lineage: lineageFor(current, k.tileId, k.nodeId, tilesMeta, doc),
    });
  }
  out.push(...structural);

  return out;
}

/* ------------------------------------------------------------------ */
/*  Squash from tree diff (fallback when log is empty)                */
/* ------------------------------------------------------------------ */

function squashFromDiff(
  baseline: Record<string, SpideyNode | null>,
  current: Record<string, SpideyNode | null>,
  tilesMeta: Record<string, TileMeta>,
  doc: SpideyDocument,
): SquashedChange[] {
  const out: SquashedChange[] = [];
  for (const tileId of Object.keys(current)) {
    const a = baseline[tileId];
    const b = current[tileId];
    if (!a && !b) continue;
    if (!a || !b) continue; // ignore tile-level appearances
    diffNode(a, b, tileId, current, tilesMeta, doc, out);
  }
  return out;
}

function diffNode(
  before: SpideyNode,
  after: SpideyNode,
  tileId: string,
  current: Record<string, SpideyNode | null>,
  tilesMeta: Record<string, TileMeta>,
  doc: SpideyDocument,
  out: SquashedChange[],
): void {
  if (before.kind === "text" && after.kind === "text") {
    if (before.value !== after.value) {
      out.push({
        kind: "text",
        tileId,
        nodeId: after.id,
        before: before.value,
        after: after.value,
        lineage: lineageFor(current, tileId, after.id, tilesMeta, doc),
      });
    }
    return;
  }
  if (before.kind !== "el" || after.kind !== "el") return;
  // styles
  const styleProps = new Set([
    ...Object.keys(before.style),
    ...Object.keys(after.style),
  ]);
  for (const p of styleProps) {
    const b0 = before.style[p] ?? null;
    const a0 = after.style[p] ?? null;
    if (b0 !== a0) {
      out.push({
        kind: "style",
        tileId,
        nodeId: after.id,
        prop: p,
        before: b0,
        after: a0,
        lineage: lineageFor(current, tileId, after.id, tilesMeta, doc),
      });
    }
  }
  // attrs
  const attrNames = new Set([
    ...Object.keys(before.attrs),
    ...Object.keys(after.attrs),
  ]);
  for (const n of attrNames) {
    if (n === "data-spidey-id") continue;
    const b0 = before.attrs[n] ?? null;
    const a0 = after.attrs[n] ?? null;
    if (b0 !== a0) {
      out.push({
        kind: "attr",
        tileId,
        nodeId: after.id,
        name: n,
        before: b0,
        after: a0,
        lineage: lineageFor(current, tileId, after.id, tilesMeta, doc),
      });
    }
  }
  // children — match by id; emit insert/remove/move for structural changes.
  const beforeIds = new Map<string, { node: SpideyNode; idx: number }>();
  before.children.forEach((c, idx) => beforeIds.set(c.id, { node: c, idx }));
  const afterIds = new Set<string>();
  after.children.forEach((c, idx) => {
    afterIds.add(c.id);
    const was = beforeIds.get(c.id);
    if (!was) {
      out.push({
        kind: "insert",
        tileId,
        node: c,
        parentId: after.id,
        index: idx,
        lineage: lineageFor(current, tileId, after.id, tilesMeta, doc),
      });
    } else {
      diffNode(was.node, c, tileId, current, tilesMeta, doc, out);
    }
  });
  for (const [id] of beforeIds) {
    if (!afterIds.has(id)) {
      out.push({
        kind: "remove",
        tileId,
        nodeId: id,
        lineage: lineageFor(current, tileId, after.id, tilesMeta, doc),
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function readStyleValue(
  tree: SpideyNode | null | undefined,
  nodeId: string,
  prop: string,
): string | null {
  if (!tree) return null;
  const n = findById(tree, nodeId);
  if (!n || n.kind !== "el") return null;
  return n.style[prop] ?? null;
}

function readAttrValue(
  tree: SpideyNode | null | undefined,
  nodeId: string,
  name: string,
): string | null {
  if (!tree) return null;
  const n = findById(tree, nodeId);
  if (!n || n.kind !== "el") return null;
  return n.attrs[name] ?? null;
}

function readTextValue(
  tree: SpideyNode | null | undefined,
  nodeId: string,
): string | null {
  if (!tree) return null;
  const n = findById(tree, nodeId);
  if (!n || n.kind !== "text") return null;
  return n.value;
}

function lineageFor(
  trees: Record<string, SpideyNode | null>,
  tileId: string,
  nodeId: string,
  tilesMeta: Record<string, TileMeta>,
  doc: SpideyDocument,
): NodeLineage {
  const tree = trees[tileId];
  const lineage: NodeLineage = {};
  if (!tree) return lineage;

  // Walk the tree to find ancestors of nodeId, gathering component name +
  // class chain on the way up.
  const path = ancestorChain(tree, nodeId);
  for (const n of path) {
    if (n.kind !== "el") continue;
    if (!lineage.componentName && n.attrs["data-spidey-component"]) {
      lineage.componentName = n.attrs["data-spidey-component"];
      const propsRaw = n.attrs["data-spidey-props"];
      if (propsRaw) {
        try {
          lineage.componentProps = JSON.parse(propsRaw) as Record<
            string,
            unknown
          >;
        } catch {
          /* ignore */
        }
      }
      // best-effort source file
      if (doc.components) {
        const spec = doc.components.find((c) => c.name === lineage.componentName);
        if (spec) lineage.componentFile = spec.file;
      }
    }
    if (n.attrs.class) {
      lineage.classChain = lineage.classChain ?? [];
      lineage.classChain.unshift(...n.attrs.class.split(/\s+/).filter(Boolean));
    }
  }

  // route source hint
  const meta = tilesMeta[tileId];
  if (!meta || meta.kind !== "component") {
    const tile = (doc.tiles ?? doc.pages ?? []).find((t) => t.id === tileId);
    if (tile?.route) {
      lineage.routeFile = inferRouteFile(tile.route, doc.project?.framework);
    }
  }

  // text context — first text descendant of the change target
  const target = findById(tree, nodeId);
  if (target) {
    const tx = firstText(target, 60);
    if (tx) lineage.textContext = tx;
  }

  return lineage;
}

function ancestorChain(root: SpideyNode, targetId: string): SpideyNode[] {
  const out: SpideyNode[] = [];
  function walk(n: SpideyNode): boolean {
    if (n.id === targetId) {
      out.push(n);
      return true;
    }
    if (n.kind !== "el") return false;
    for (const c of n.children) {
      if (walk(c)) {
        out.push(n);
        return true;
      }
    }
    return false;
  }
  walk(root);
  return out;
}

function firstText(node: SpideyNode, max: number): string | null {
  if (node.kind === "text") {
    const v = node.value.trim();
    return v.length > max ? v.slice(0, max) + "…" : v || null;
  }
  for (const c of node.children) {
    const v = firstText(c, max);
    if (v) return v;
  }
  return null;
}

function countInstanceTiles(
  componentName: string,
  current: Record<string, SpideyNode | null>,
  tilesMeta: Record<string, TileMeta>,
): number {
  let count = 0;
  for (const [tileId, tree] of Object.entries(current)) {
    if (!tree) continue;
    if (tilesMeta[tileId]?.kind === "component") continue; // skip the master itself
    if (treeContainsInstance(tree, componentName)) count++;
  }
  return count;
}

function treeContainsInstance(node: SpideyNode, componentName: string): boolean {
  if (node.kind !== "el") return false;
  if (node.attrs["data-spidey-component"] === componentName) return true;
  for (const c of node.children) {
    if (treeContainsInstance(c, componentName)) return true;
  }
  return false;
}

function tileLabel(
  tileId: string,
  doc: SpideyDocument,
  tilesMeta: Record<string, TileMeta>,
): string {
  const meta = tilesMeta[tileId];
  if (meta?.kind === "component" && meta.componentName) {
    return `<${meta.componentName}>`;
  }
  const tile = (doc.tiles ?? doc.pages ?? []).find((t) => t.id === tileId);
  if (tile?.route) return tile.route;
  if (tile?.title) return tile.title;
  return tileId;
}

function sourceHintsForTile(
  tileId: string,
  doc: SpideyDocument,
  tilesMeta: Record<string, TileMeta>,
): string[] {
  const meta = tilesMeta[tileId];
  const hints: string[] = [];
  if (meta?.kind === "component" && meta.componentName && doc.components) {
    const spec = doc.components.find((c) => c.name === meta.componentName);
    if (spec?.file) hints.push(spec.file);
  } else {
    const tile = (doc.tiles ?? doc.pages ?? []).find((t) => t.id === tileId);
    if (tile?.route) {
      const f = inferRouteFile(tile.route, doc.project?.framework);
      if (f) hints.push(f);
    }
  }
  return hints;
}

function inferRouteFile(
  route: string,
  framework: string | undefined,
): string | undefined {
  if (framework === "next") {
    const segs = route.split("/").filter(Boolean);
    if (segs.length === 0) return "app/page.tsx";
    return `app/${segs.join("/")}/page.tsx`;
  }
  if (framework === "vite") {
    return "src/main.tsx";
  }
  return undefined;
}

function describeChange(c: SquashedChange): string {
  switch (c.kind) {
    case "style":
      return `style.${c.prop}: ${fmt(c.before)} → ${fmt(c.after)}${ctxBit(c.lineage)}`;
    case "attr":
      return `attr ${c.name}: ${fmt(c.before)} → ${fmt(c.after)}${ctxBit(c.lineage)}`;
    case "text":
      return `text: ${fmt(c.before)} → ${fmt(c.after)}${ctxBit(c.lineage)}`;
    case "insert":
      return `insert ${describePrimitive(c.node)} at ${c.parentId}[${c.index}]${ctxBit(c.lineage)}`;
    case "remove":
      return `remove ${c.nodeId}${ctxBit(c.lineage)}`;
    case "move":
      return `move ${c.nodeId} → ${c.newParentId}[${c.newIndex}]${ctxBit(c.lineage)}`;
    case "duplicate":
      return `duplicate ${c.sourceNodeId}${ctxBit(c.lineage)}`;
    case "paste":
      return `paste-as-child of ${c.parentId}${ctxBit(c.lineage)}`;
  }
}

function describePrimitive(node: SpideyNode): string {
  if (node.kind === "text") return `text "${truncate(node.value, 40)}"`;
  const cls = node.attrs.class ? `.${node.attrs.class.replace(/\s+/g, ".")}` : "";
  const summary = `<${node.tag}${cls}>`;
  return summary;
}

function describeLineage(l: NodeLineage): string {
  const bits: string[] = [];
  if (l.componentName) bits.push(`<${l.componentName}>`);
  if (l.classChain && l.classChain.length > 0) {
    bits.push(`.${l.classChain.slice(0, 3).join(".")}`);
  }
  if (l.textContext) bits.push(`"${truncate(l.textContext, 30)}"`);
  return bits.length ? bits.join(" / ") : "(root)";
}

function ctxBit(l: NodeLineage): string {
  const tag = describeLineage(l);
  return tag === "(root)" ? "" : `   [${tag}]`;
}

function fmt(v: string | null): string {
  if (v === null) return "(unset)";
  return JSON.stringify(v);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
