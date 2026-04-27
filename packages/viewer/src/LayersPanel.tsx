import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Link2,
  Scissors,
  Trash2,
} from "lucide-react";
import type { SpideyNode } from "@spidey/shared";
import {
  buildTree,
  findNode,
  isDescendant,
  type TreeNode,
} from "./inspect/buildTree";
import { findParent as findSpideyParent } from "./editor/tree";
import type { EditAction } from "./editor/state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  /** id of the active tile, used to scope dispatched actions */
  tileId: string;
  /** raw SpideyNode tree of the active tile (drives buildTree + drag-drop) */
  tree: SpideyNode | null;
  selectedId: string | null;
  /** monotonic editor rev — invalidates buildTree memo on edits */
  rev: number;
  onSelect: (id: string | null) => void;
  /** Hover a row → highlight that node in the canvas. */
  onHover: (id: string | null) => void;
  dispatch: (action: EditAction) => void;
};

/**
 * Breadcrumb + scrollable layers tree + context menu, lifted out of the
 * Inspector into the left sidebar. Owns its own context-menu state and
 * drag-drop reparenting; selection/hover/edit go up via callbacks so the
 * canvas stays in sync.
 */
export function LayersPanel({
  tileId,
  tree,
  selectedId,
  rev,
  onSelect,
  onHover,
  dispatch,
}: Props) {
  const trees = useMemo(() => buildTree(tree), [tree, rev]);
  const found = useMemo(
    () => (selectedId ? findNode(trees, selectedId) : null),
    [trees, selectedId],
  );
  const breadcrumb = found ? [...found.ancestors, found.node] : [];

  // Context menu is anchored to the row that opened it; we drive a hidden
  // DropdownMenuTrigger positioned at the cursor and let the dropdown manage
  // open/close + outside-click semantics.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

  return (
    <div
      className="flex flex-col min-h-0 flex-1"
      onMouseLeave={() => onHover(null)}
    >
      {breadcrumb.length > 0 && (
        <div className="px-3 py-2 border-b border-border text-[11px] text-muted-foreground whitespace-nowrap overflow-x-auto shrink-0">
          {breadcrumb.map((n, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={n.id} className="inline-flex items-center">
                {i > 0 && (
                  <ChevronRight
                    size={11}
                    strokeWidth={2}
                    className="mx-0.5 text-muted-foreground/70 shrink-0"
                  />
                )}
                <button
                  onClick={() => onSelect(n.id)}
                  title={describeNode(n)}
                  className={[
                    "bg-transparent border-0 px-1 py-0.5 cursor-pointer rounded font-mono text-[11px] hover:bg-muted hover:text-foreground",
                    isLast ? "text-primary font-semibold" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {nodeChip(n)}
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="text-[10px] uppercase tracking-[0.6px] text-muted-foreground/70 px-3 pt-3 pb-1 shrink-0">
        Layers
      </div>
      <div className="flex-1 overflow-y-auto pb-2 font-mono text-[11px]">
        {trees.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground text-[11px]">
            Empty tree.
          </div>
        ) : (
          trees.map((n) => (
            <TreeRow
              key={n.id}
              node={n}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onHover={onHover}
              defaultOpenDepth={2}
              tileId={tileId}
              dispatch={dispatch}
              tree={tree}
              onMenu={(id, x, y) => setMenu({ id, x, y })}
            />
          ))
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onCopy={() => dispatch({ type: "copyNode", tileId, nodeId: menu.id })}
          onCut={() => {
            dispatch({ type: "cutNode", tileId, nodeId: menu.id });
            onSelect(null);
          }}
          onPaste={() =>
            dispatch({ type: "pasteAsChild", tileId, parentId: menu.id })
          }
          onDuplicate={() =>
            dispatch({ type: "duplicateNode", tileId, nodeId: menu.id })
          }
          onDelete={() => {
            dispatch({ type: "removeNode", tileId, nodeId: menu.id });
            onSelect(null);
          }}
        />
      )}
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onDelete,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu open onOpenChange={(o) => !o && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: x,
            top: y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        <DropdownMenuItem onSelect={onDuplicate}>
          <CopyPlus />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCopy}>
          <Copy />
          Copy
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCut}>
          <Scissors />
          Cut
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPaste}>
          <ClipboardPaste />
          Paste as child
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TreeRow({
  node,
  depth,
  selectedId,
  onSelect,
  onHover,
  defaultOpenDepth,
  tileId,
  dispatch,
  tree,
  onMenu,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  defaultOpenDepth: number;
  tileId: string;
  dispatch: (a: EditAction) => void;
  tree: SpideyNode | null;
  onMenu: (id: string, x: number, y: number) => void;
}) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);
  const rowRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  // Drop indicator state: 'before' | 'after' | 'inside' | null
  const [dropZone, setDropZone] = useState<"before" | "after" | "inside" | null>(
    null,
  );

  // Auto-open only when the SELECTION changes to a descendant — once the
  // user manually folds, we don't want this effect to fight that fold on
  // every render. Tracking the last id we opened for keeps the auto-reveal
  // behaviour without trapping the row open.
  const lastAutoOpenedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    if (lastAutoOpenedFor.current === selectedId) return;
    if (selectedId !== node.id && isDescendant(node, selectedId)) {
      lastAutoOpenedFor.current = selectedId;
      setOpen(true);
    }
  }, [selectedId, node]);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const isComponent = !!node.componentName;

  const onDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/x-spidey-node", node.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    if (y < h * 0.25) setDropZone("before");
    else if (y > h * 0.75) setDropZone("after");
    else setDropZone("inside");
    e.dataTransfer.dropEffect = "move";
  };
  const onDragLeave = () => setDropZone(null);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData("application/x-spidey-node");
    const zone = dropZone;
    setDropZone(null);
    if (!draggedId || draggedId === node.id) return;
    if (zone === "inside") {
      // The reducer's moveNode is cycle-safe — if this would create a cycle
      // (dropping a node into its own subtree) it returns the tree unchanged.
      dispatch({
        type: "moveNode",
        tileId,
        nodeId: draggedId,
        newParentId: node.id,
        newIndex: 1_000_000, // append
      });
      return;
    }
    // Sibling drop: locate this anchor's parent + index in the SpideyNode
    // tree to compute the destination.
    if (!tree) return;
    const found = findSpideyParent(tree, node.id);
    if (!found) return;
    const offset = zone === "after" ? 1 : 0;
    dispatch({
      type: "moveNode",
      tileId,
      nodeId: draggedId,
      newParentId: found.parent.id,
      newIndex: found.index + offset,
    });
  };

  return (
    <div>
      <div
        ref={rowRef}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => onSelect(node.id)}
        onMouseEnter={(e) => {
          // stopPropagation: parent rows would otherwise re-claim hover
          // when the cursor enters one of their child rows.
          e.stopPropagation();
          onHover(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onSelect(node.id);
          onMenu(node.id, e.clientX, e.clientY);
        }}
        className={[
          "relative flex items-center gap-1 py-0.5 cursor-pointer whitespace-nowrap",
          isSelected ? "bg-primary/15 text-primary" : "hover:bg-muted",
        ].join(" ")}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {dropZone === "before" && (
          <div className="absolute top-0 left-0 right-0 h-px bg-primary pointer-events-none" />
        )}
        {dropZone === "after" && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-primary pointer-events-none" />
        )}
        {dropZone === "inside" && (
          <div className="absolute inset-0 ring-1 ring-primary ring-inset pointer-events-none" />
        )}
        <motion.span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={[
            "inline-grid place-items-center w-3 h-3 shrink-0 text-muted-foreground/70",
            hasChildren ? "cursor-pointer" : "opacity-0",
          ].join(" ")}
        >
          <ChevronRight size={10} strokeWidth={2.5} />
        </motion.span>
        {isComponent ? (
          <>
            <Link2
              size={11}
              strokeWidth={2.5}
              className="text-primary shrink-0"
            />
            <span className="font-semibold tracking-wide text-[12px] text-primary">
              {node.componentName}
            </span>
            <span className="text-muted-foreground/70 text-[10px]">
              · {node.tag}
              {node.classes.length > 0 ? `.${node.classes[0]}` : ""}
            </span>
          </>
        ) : (
          <>
            <span className={isSelected ? "text-primary" : "text-foreground"}>
              {node.tag}
            </span>
            {node.domId && <span className="text-amber-500">#{node.domId}</span>}
            {node.classes.length > 0 && (
              <span className="text-muted-foreground">.{node.classes[0]}</span>
            )}
            {node.textPreview && (
              <span className="text-muted-foreground/70 text-[10px] italic">
                "{node.textPreview}"
              </span>
            )}
          </>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && hasChildren && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            {node.children.map((c) => (
              <TreeRow
                key={c.id}
                node={c}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onHover={onHover}
                defaultOpenDepth={defaultOpenDepth}
                tileId={tileId}
                dispatch={dispatch}
                tree={tree}
                onMenu={onMenu}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function describeNode(n: TreeNode): string {
  let s = n.tag;
  if (n.domId) s += `#${n.domId}`;
  if (n.classes.length) s += "." + n.classes.join(".");
  return s;
}

function nodeChip(n: TreeNode): string {
  if (n.domId) return `${n.tag}#${n.domId}`;
  if (n.classes.length) return `${n.tag}.${n.classes[0]}`;
  return n.tag;
}
