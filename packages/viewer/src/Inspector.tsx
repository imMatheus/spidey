import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  Trash2,
  Link2,
  Lock,
  PenSquare,
} from "lucide-react";
import type { SpideyNode } from "@spidey/shared";
import {
  buildTree,
  findNode,
  isDescendant,
  type TreeNode,
} from "./inspect/buildTree";
import {
  buildStyleSections,
  summarizeElement,
  type StyleSection,
  type ElementSummary,
} from "./inspect/computeStyles";
import {
  findById,
  findInstanceAncestor,
  findParent as findSpideyParent,
} from "./editor/tree";
import type { EditAction } from "./editor/state";

type Props = {
  tileId: string | null;
  componentInfo: {
    name: string;
    file: string;
    propsUsed: Record<string, unknown>;
  } | null;
  tree: SpideyNode | null;
  selectedNodeId: string | null;
  selectedElement: HTMLElement | null;
  tileBody: HTMLElement | null;
  scale: number;
  rev: number;
  onSelectNode: (id: string | null) => void;
  /** Hover a node from the layers tree → highlight in the canvas. */
  onHoverNode: (id: string | null) => void;
  /** Activate the master tile for the given component name. */
  onEditMaster: (componentName: string) => void;
  dispatch: (action: EditAction) => void;
};

const ASIDE =
  "col-start-3 row-start-1 row-span-2 bg-panel border-l border-edge flex flex-col min-h-0 overflow-hidden";

export function Inspector({
  tileId,
  componentInfo,
  tree,
  selectedNodeId,
  selectedElement,
  tileBody,
  scale,
  rev,
  onSelectNode,
  onHoverNode,
  onEditMaster,
  dispatch,
}: Props) {
  const trees = useMemo(() => buildTree(tree), [tree, rev]);

  if (!tileId || trees.length === 0) {
    return (
      <aside className={ASIDE}>
        <div className="grid place-items-center h-full text-fg-dim text-center text-xs">
          <div>
            <div className="text-fg text-sm mb-1">No tile selected</div>
            <div>Click a screen to inspect it</div>
          </div>
        </div>
      </aside>
    );
  }

  const selectedNode = selectedNodeId && tree ? findById(tree, selectedNodeId) : null;

  // The active tile is a master when componentInfo is set. Otherwise it's a
  // route, and any selection inside a component-instance subtree is locked.
  const isMasterTile = !!componentInfo;
  const instanceLock =
    !isMasterTile && selectedNodeId
      ? findInstanceAncestor(tree, selectedNodeId)
      : null;

  return (
    <aside className={ASIDE}>
      {componentInfo && <ComponentHeader info={componentInfo} />}
      <BreadcrumbAndTree
        key={tileId ?? "no-tile"}
        trees={trees}
        tree={tree}
        selectedId={selectedNodeId}
        onSelect={onSelectNode}
        onHover={onHoverNode}
        tileId={tileId}
        dispatch={dispatch}
      />
      {instanceLock && (
        <InstanceLockBanner
          componentName={instanceLock.componentName}
          onEditMaster={() => onEditMaster(instanceLock.componentName)}
        />
      )}
      {selectedNodeId && selectedElement && tileBody && (
        <StylePanels
          el={selectedElement}
          tileBody={tileBody}
          scale={scale}
          rev={rev}
          tileId={tileId}
          nodeId={selectedNodeId}
          node={
            selectedNode && selectedNode.kind === "el" ? selectedNode : null
          }
          locked={!!instanceLock}
          dispatch={dispatch}
        />
      )}
    </aside>
  );
}

function InstanceLockBanner({
  componentName,
  onEditMaster,
}: {
  componentName: string;
  onEditMaster: () => void;
}) {
  return (
    <div className="border-b border-edge bg-accent-soft/40 px-3 py-2 flex items-center gap-2">
      <Lock size={13} strokeWidth={2} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-fg flex items-center gap-1.5">
          <span>Instance of</span>
          <span className="font-mono text-accent font-semibold">
            {`<${componentName}>`}
          </span>
        </div>
        <div className="text-[10px] text-fg-dim">
          Style edits go on the master.
        </div>
      </div>
      <button
        onClick={onEditMaster}
        title={`Open the <${componentName}> master tile`}
        className="text-[11px] inline-flex items-center gap-1 bg-accent text-white px-2 py-1 rounded cursor-pointer hover:bg-accent/90 shrink-0"
      >
        <PenSquare size={11} strokeWidth={2} />
        Edit master
      </button>
    </div>
  );
}

function SelectedComponentPanel({
  name,
  props,
}: {
  name: string;
  props: Record<string, unknown> | null;
}) {
  const entries = props
    ? Object.entries(props).filter(
        ([, v]) =>
          v !== "__spidey_noop__" && typeof v !== "function",
      )
    : [];
  return (
    <div className="border-b border-edge p-3 bg-bg/30">
      <div className="font-mono text-accent text-[14px] font-semibold">
        {`<${name}>`}
      </div>
      {entries.length > 0 ? (
        <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 text-[11px]">
          {entries.map(([k, v]) => (
            <PropRow key={k} name={k} value={v} />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-fg-faint italic">
          {props ? "no data props" : "no captured props"}
        </div>
      )}
    </div>
  );
}

function ComponentHeader({
  info,
}: {
  info: { name: string; file: string; propsUsed: Record<string, unknown> };
}) {
  const props = Object.entries(info.propsUsed).filter(
    ([, v]) => v !== "__spidey_noop__",
  );
  return (
    <div className="border-b border-edge p-3 bg-bg/30 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-accent text-[14px] font-semibold">
          {`<${info.name}>`}
        </span>
        <span className="text-[10px] text-fg-faint truncate" title={info.file}>
          {info.file}
        </span>
      </div>
      {props.length > 0 ? (
        <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 text-[11px]">
          {props.map(([k, v]) => (
            <PropRow key={k} name={k} value={v} />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-fg-faint italic">no props</div>
      )}
    </div>
  );
}

function PropRow({ name, value }: { name: string; value: unknown }) {
  return (
    <>
      <span className="text-fg-dim font-mono">{name}</span>
      <span className="text-fg font-mono break-words min-w-0">
        {formatPropValue(value)}
      </span>
    </>
  );
}

function formatPropValue(v: unknown): string {
  if (v === "__spidey_noop__") return "ƒ noop";
  if (v == null) return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v))
    return `[${v.length} item${v.length === 1 ? "" : "s"}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    return `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }`;
  }
  return String(v);
}

function BreadcrumbAndTree({
  trees,
  tree,
  selectedId,
  onSelect,
  onHover,
  tileId,
  dispatch,
}: {
  trees: TreeNode[];
  tree: SpideyNode | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  tileId: string;
  dispatch: (a: EditAction) => void;
}) {
  const found = useMemo(
    () => (selectedId ? findNode(trees, selectedId) : null),
    [trees, selectedId],
  );
  const breadcrumb = found ? [...found.ancestors, found.node] : [];

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );

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
    <>
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
      <div
        className="flex flex-col min-h-[100px] max-h-[36%] shrink-0 border-b border-edge"
        onMouseLeave={() => onHover(null)}
      >
        <SectionTitle>Layers</SectionTitle>
        <div className="flex-1 overflow-y-auto pb-2 font-mono text-[11px]">
          {trees.map((n) => (
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
          ))}
        </div>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onCopy={() =>
            dispatch({ type: "copyNode", tileId, nodeId: menu.id })
          }
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
    </>
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
          isSelected
            ? "bg-accent-soft text-accent"
            : "hover:bg-panel-2",
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

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.6px] text-fg-faint px-3 pt-3 pb-1">
      {children}
    </div>
  );
}

function StylePanels({
  el,
  tileBody,
  scale,
  rev,
  tileId,
  nodeId,
  node,
  locked,
  dispatch,
}: {
  el: HTMLElement;
  tileBody: HTMLElement;
  scale: number;
  rev: number;
  tileId: string;
  nodeId: string;
  node: (SpideyNode & { kind: "el" }) | null;
  locked: boolean;
  dispatch: (a: EditAction) => void;
}) {
  const [data, setData] = useState<{
    summary: ElementSummary;
    sections: StyleSection[];
  } | null>(null);

  useEffect(() => {
    const summary = summarizeElement(el, tileBody, scale);
    const sections = buildStyleSections(el, summary.rect);
    setData({ summary, sections });
  }, [el, tileBody, scale, rev]);

  if (!data) return null;
  const { summary, sections } = data;

  // Component-instance panel: surface name + props
  const componentName = el.getAttribute("data-spidey-component");
  const propsAttr = el.getAttribute("data-spidey-props");
  let runtimeProps: Record<string, unknown> | null = null;
  if (propsAttr) {
    try {
      runtimeProps = JSON.parse(propsAttr) as Record<string, unknown>;
    } catch {
      runtimeProps = null;
    }
  }

  const inlineStyle = node?.style ?? {};
  const setStyle = (prop: string, value: string | null) =>
    dispatch({ type: "setStyle", tileId, nodeId, prop, value });

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {componentName && (
        <SelectedComponentPanel name={componentName} props={runtimeProps} />
      )}
      <div className="p-3 border-b border-edge">
        <div className="font-mono text-[13px] text-fg mb-1.5">
          &lt;{summary.tag}&gt;
          {summary.domId && (
            <span className="text-amberish ml-1">#{summary.domId}</span>
          )}
        </div>
        {summary.classes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {summary.classes.map((c) => (
              <span
                key={c}
                className="bg-panel-2 border border-edge text-fg-dim font-mono text-[11px] px-1.5 py-px rounded-sm"
              >
                .{c}
              </span>
            ))}
          </div>
        )}
        {summary.textPreview && (
          <div className="text-[11px] text-fg-dim italic mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
            "{summary.textPreview}"
          </div>
        )}
      </div>

      {!locked && (
        <>
          <EditableStyle
            title="Background"
            inline={inlineStyle}
            setStyle={setStyle}
            fields={[
              { prop: "background", label: "color", kind: "color" },
            ]}
          />
          <EditableStyle
            title="Typography"
            inline={inlineStyle}
            setStyle={setStyle}
            fields={[
              { prop: "color", label: "color", kind: "color" },
              { prop: "font-size", label: "size", kind: "text", placeholder: "16px" },
              { prop: "font-weight", label: "weight", kind: "text", placeholder: "400" },
              { prop: "text-align", label: "align", kind: "select", options: ["", "left", "center", "right", "justify"] },
            ]}
          />
          <EditableStyle
            title="Layout"
            inline={inlineStyle}
            setStyle={setStyle}
            fields={[
              { prop: "width", label: "width", kind: "text", placeholder: "auto" },
              { prop: "height", label: "height", kind: "text", placeholder: "auto" },
              { prop: "padding", label: "padding", kind: "text", placeholder: "0" },
              { prop: "margin", label: "margin", kind: "text", placeholder: "0" },
            ]}
          />
          <EditableStyle
            title="Border"
            inline={inlineStyle}
            setStyle={setStyle}
            fields={[
              { prop: "border-radius", label: "radius", kind: "text", placeholder: "0" },
              { prop: "border", label: "border", kind: "text", placeholder: "none" },
            ]}
          />
        </>
      )}

      {sections.map((s) =>
        s.title === "Spacing" ? (
          <BoxModelSection key={s.title} section={s} />
        ) : (
          <SectionBlock key={s.title} section={s} />
        ),
      )}
    </div>
  );
}

type EditableField =
  | { prop: string; label: string; kind: "text"; placeholder?: string }
  | { prop: string; label: string; kind: "color" }
  | { prop: string; label: string; kind: "select"; options: string[] };

function EditableStyle({
  title,
  fields,
  inline,
  setStyle,
}: {
  title: string;
  fields: EditableField[];
  inline: Record<string, string>;
  setStyle: (prop: string, value: string | null) => void;
}) {
  return (
    <div className="border-b border-edge">
      <SectionTitle>{title}</SectionTitle>
      <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 px-3 pb-3 text-[11px] items-center">
        {fields.map((f) => (
          <FieldRow key={f.prop} field={f} value={inline[f.prop] ?? ""} setStyle={setStyle} />
        ))}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  setStyle,
}: {
  field: EditableField;
  value: string;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Mirror external value changes (undo, redo, programmatic edits).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    if (next === value) return;
    setStyle(field.prop, next === "" ? null : next);
  };

  if (field.kind === "color") {
    const hex = toHex(value);
    return (
      <>
        <span className="text-fg-faint font-mono">{field.label}</span>
        <span className="flex items-center gap-1.5">
          <input
            type="color"
            value={hex}
            onChange={(e) => commit(e.target.value)}
            className="w-5 h-5 bg-transparent border border-edge rounded cursor-pointer p-0"
          />
          <input
            type="text"
            value={draft}
            placeholder="—"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value.trim())}
            className="flex-1 min-w-0 bg-panel-2 border border-edge rounded px-1.5 py-1 text-[11px] font-mono text-fg focus:outline-none focus:border-accent"
          />
        </span>
      </>
    );
  }
  if (field.kind === "select") {
    return (
      <>
        <span className="text-fg-faint font-mono">{field.label}</span>
        <select
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          className="bg-panel-2 border border-edge rounded px-1.5 py-1 text-[11px] font-mono text-fg focus:outline-none focus:border-accent"
        >
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o || "—"}
            </option>
          ))}
        </select>
      </>
    );
  }
  return (
    <>
      <span className="text-fg-faint font-mono">{field.label}</span>
      <input
        type="text"
        value={draft}
        placeholder={field.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="bg-panel-2 border border-edge rounded px-1.5 py-1 text-[11px] font-mono text-fg focus:outline-none focus:border-accent"
      />
    </>
  );
}

function toHex(value: string): string {
  if (!value) return "#000000";
  const s = value.trim();
  if (s.startsWith("#") && (s.length === 7 || s.length === 4)) {
    if (s.length === 4) {
      return (
        "#" +
        s
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      );
    }
    return s;
  }
  // Try rgb(...) → #rrggbb. Color picker doesn't accept named colors.
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const [, r, g, b] = m;
    const toH = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    return "#" + toH(+r) + toH(+g) + toH(+b);
  }
  return "#000000";
}

function SectionBlock({ section }: { section: StyleSection }) {
  return (
    <div className="border-b border-edge">
      <SectionTitle>{section.title}</SectionTitle>
      <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 px-3 pb-3 text-[11px]">
        {section.props.map((p) => (
          <Row key={p.label} label={p.label}>
            {p.color && (
              <span
                className="color-chip inline-block w-3.5 h-3.5 rounded-sm border border-white/20 shrink-0"
                style={{
                  backgroundColor: `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${p.color.a})`,
                }}
              />
            )}
            <span className="overflow-hidden text-ellipsis">{p.value}</span>
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-fg-faint font-mono">{label}</span>
      <span className="text-fg font-mono flex items-center gap-1.5 break-words min-w-0">
        {children}
      </span>
    </>
  );
}

function BoxModelSection({ section }: { section: StyleSection }) {
  const padding =
    section.props.find((p) => p.label === "padding")?.value ?? "0px";
  const margin =
    section.props.find((p) => p.label === "margin")?.value ?? "0px";
  const padBox = parseBox(padding);
  const marBox = parseBox(margin);
  return (
    <div className="border-b border-edge">
      <SectionTitle>{section.title}</SectionTitle>
      <div className="px-3 pb-4 pt-2">
        <div className="relative bg-amber-500/15 border border-dashed border-amber-500/50 px-6 py-6 text-center text-[10px] text-fg-dim">
          <span className="absolute top-0.5 left-1 text-[9px] uppercase tracking-[0.5px] text-amber-500/90">
            margin
          </span>
          <BoxEdge pos="top">{marBox.top}</BoxEdge>
          <BoxEdge pos="bottom">{marBox.bottom}</BoxEdge>
          <BoxEdge pos="left">{marBox.left}</BoxEdge>
          <BoxEdge pos="right">{marBox.right}</BoxEdge>
          <div className="relative bg-emerald-400/15 border border-dashed border-emerald-400/50 px-6 py-6 mt-3">
            <span className="absolute top-0.5 left-1 text-[9px] uppercase tracking-[0.5px] text-emerald-400/90">
              padding
            </span>
            <BoxEdge pos="top">{padBox.top}</BoxEdge>
            <BoxEdge pos="bottom">{padBox.bottom}</BoxEdge>
            <BoxEdge pos="left">{padBox.left}</BoxEdge>
            <BoxEdge pos="right">{padBox.right}</BoxEdge>
            <div className="bg-panel-2 text-fg-dim py-3 text-[11px] font-mono text-center">
              content
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BoxEdge({
  pos,
  children,
}: {
  pos: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  const map = {
    top: "top-1 left-1/2 -translate-x-1/2",
    bottom: "bottom-1 left-1/2 -translate-x-1/2",
    left: "left-1 top-1/2 -translate-y-1/2",
    right: "right-1 top-1/2 -translate-y-1/2",
  } as const;
  return (
    <span className={`absolute text-[11px] text-fg font-mono ${map[pos]}`}>
      {children}
    </span>
  );
}

function parseBox(value: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  const parts = value.trim().split(/\s+/).map((p) => p.replace("px", ""));
  if (parts.length === 1)
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2)
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3)
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}
