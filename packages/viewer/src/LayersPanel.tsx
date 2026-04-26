import { useEffect, useMemo, useRef, useState } from "react";
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

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

  // Auto-close the context menu on any outside click or scroll. The window
  // listener fires for clicks on Items inside the menu too; Item handlers
  // run first (synthetic React handler), then the window handler closes.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return (
    <div
      className="flex flex-col min-h-0 flex-1"
      onMouseLeave={() => onHover(null)}
    >
      {breadcrumb.length > 0 && (
        <div className="px-3 py-2 border-b border-edge text-[11px] text-fg-dim whitespace-nowrap overflow-x-auto shrink-0">
          {breadcrumb.map((n, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={n.id} className="inline-flex items-center">
                {i > 0 && (
                  <ChevronRight
                    size={11}
                    strokeWidth={2}
                    className="mx-0.5 text-fg-faint shrink-0"
                  />
                )}
                <button
                  onClick={() => onSelect(n.id)}
                  title={describeNode(n)}
                  className={[
                    "bg-transparent border-0 px-1 py-0.5 cursor-pointer rounded font-mono text-[11px] hover:bg-panel-2 hover:text-fg",
                    isLast ? "text-accent font-semibold" : "text-fg-dim",
                  ].join(" ")}
                >
                  {nodeChip(n)}
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="text-[10px] uppercase tracking-[0.6px] text-fg-faint px-3 pt-3 pb-1 shrink-0">
        Layers
      </div>
      <div className="flex-1 overflow-y-auto pb-2 font-mono text-[11px]">
        {trees.length === 0 ? (
          <div className="px-3 py-2 text-fg-dim text-[11px]">
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
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onDelete,
}: {
  x: number;
  y: number;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const Item = ({
    label,
    onClick,
    Icon,
    danger,
  }: {
    label: string;
    onClick: () => void;
    Icon: typeof Copy;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={[
        "w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-sans cursor-pointer hover:bg-panel-2 text-left",
        danger ? "text-[#ff8a8a]" : "text-fg",
      ].join(" ")}
    >
      <Icon size={13} strokeWidth={2} className="shrink-0" />
      {label}
    </button>
  );
  return (
    <div
      className="fixed z-50 bg-panel border border-edge rounded-md shadow-lg py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <Item label="Duplicate" onClick={onDuplicate} Icon={CopyPlus} />
      <Item label="Copy" onClick={onCopy} Icon={Copy} />
      <Item label="Cut" onClick={onCut} Icon={Scissors} />
      <Item label="Paste as child" onClick={onPaste} Icon={ClipboardPaste} />
      <div className="h-px bg-edge my-1" />
      <Item label="Delete" onClick={onDelete} Icon={Trash2} danger />
    </div>
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
  const containsSelected =
    !!selectedId && (isSelected || isDescendant(node, selectedId));

  // Drop indicator state: 'before' | 'after' | 'inside' | null
  const [dropZone, setDropZone] = useState<"before" | "after" | "inside" | null>(
    null,
  );

  useEffect(() => {
    if (containsSelected && !open) setOpen(true);
  }, [containsSelected, open]);

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
          isSelected ? "bg-accent-soft text-accent" : "hover:bg-panel-2",
        ].join(" ")}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        {dropZone === "before" && (
          <div className="absolute top-0 left-0 right-0 h-px bg-accent pointer-events-none" />
        )}
        {dropZone === "after" && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-accent pointer-events-none" />
        )}
        {dropZone === "inside" && (
          <div className="absolute inset-0 ring-1 ring-accent ring-inset pointer-events-none" />
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          className={[
            "inline-grid place-items-center w-3 h-3 shrink-0 text-fg-faint transition-transform",
            hasChildren ? "cursor-pointer" : "opacity-0",
            open ? "rotate-90" : "",
          ].join(" ")}
        >
          <ChevronRight size={10} strokeWidth={2.5} />
        </span>
        {isComponent ? (
          <>
            <Link2
              size={11}
              strokeWidth={2.5}
              className="text-accent shrink-0"
            />
            <span className="font-semibold tracking-wide text-[12px] text-accent">
              {node.componentName}
            </span>
            <span className="text-fg-faint text-[10px]">
              · {node.tag}
              {node.classes.length > 0 ? `.${node.classes[0]}` : ""}
            </span>
          </>
        ) : (
          <>
            <span className={isSelected ? "text-accent" : "text-fg"}>
              {node.tag}
            </span>
            {node.domId && <span className="text-amberish">#{node.domId}</span>}
            {node.classes.length > 0 && (
              <span className="text-fg-dim">.{node.classes[0]}</span>
            )}
            {node.textPreview && (
              <span className="text-fg-faint text-[10px] italic">
                "{node.textPreview}"
              </span>
            )}
          </>
        )}
      </div>
      {open &&
        node.children.map((c) => (
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
