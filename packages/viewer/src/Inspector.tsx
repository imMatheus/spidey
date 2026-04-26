import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TreeNode } from "./inspect/buildTree";
import { findNode } from "./inspect/buildTree";
import {
  buildStyleSections,
  summarizeElement,
  type StyleSection,
  type ElementSummary,
} from "./inspect/computeStyles";

type Props = {
  /** Identifies which tile's tree we're showing — used to fully remount the
   *  tree subtree when switching tiles, so per-row open/closed state can't
   *  bleed across tiles via shared path-keys like "0.1.2". */
  tileId: string | null;
  /** Component metadata for the active tile, when it is a component tile. */
  componentInfo: {
    name: string;
    file: string;
    propsUsed: Record<string, unknown>;
  } | null;
  trees: TreeNode[] | null;
  selected: HTMLElement | null;
  tileBody: HTMLElement | null;
  scale: number;
  onSelect: (el: HTMLElement) => void;
  recomputeKey: number;
};

const ASIDE =
  "col-start-3 row-start-1 row-span-2 bg-panel border-l border-edge flex flex-col min-h-0 overflow-hidden";

export function Inspector({
  tileId,
  componentInfo,
  trees,
  selected,
  tileBody,
  scale,
  onSelect,
  recomputeKey,
}: Props) {
  if (!trees) {
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

  return (
    <aside className={ASIDE}>
      {componentInfo && <ComponentHeader info={componentInfo} />}
      <BreadcrumbAndTree
        key={tileId ?? "no-tile"}
        trees={trees}
        selected={selected}
        onSelect={onSelect}
      />
      {selected && tileBody && (
        <StylePanels
          el={selected}
          tileBody={tileBody}
          scale={scale}
          recomputeKey={recomputeKey}
        />
      )}
    </aside>
  );
}

/**
 * Inline panel rendered inside StylePanels when the selected element is the
 * root of a React component instance captured during a route screenshot.
 * Surfaces the component name + the props snapshot (sans functions).
 */
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
  // Functions don't read meaningfully in a side panel — surface only data
  // props (strings, numbers, booleans, arrays, objects).
  const props = Object.entries(info.propsUsed).filter(
    ([, v]) => v !== "__spidey_noop__",
  );
  return (
    <div className="border-b border-edge p-3 bg-bg/30 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-accent text-[14px] font-semibold">
          {`<${info.name}>`}
        </span>
        <span
          className="text-[10px] text-fg-faint truncate"
          title={info.file}
        >
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
  selected,
  onSelect,
}: {
  trees: TreeNode[];
  selected: HTMLElement | null;
  onSelect: (el: HTMLElement) => void;
}) {
  const found = useMemo(
    () => (selected ? findNode(trees, selected) : null),
    [trees, selected],
  );
  const breadcrumb = found ? [...found.ancestors, found.node] : [];

  return (
    <>
      {breadcrumb.length > 0 && (
        <div className="px-3 py-2 border-b border-edge text-[11px] text-fg-dim whitespace-nowrap overflow-x-auto shrink-0">
          {breadcrumb.map((n, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={n.id}>
                {i > 0 && (
                  <span className="mx-0.5 text-fg-faint">›</span>
                )}
                <button
                  onClick={() => onSelect(n.ref)}
                  title={describeNode(n)}
                  className={[
                    "bg-transparent border-0 px-1 py-0.5 cursor-pointer rounded font-mono text-[11px] hover:bg-panel-2 hover:text-fg",
                    isLast
                      ? "text-accent font-semibold"
                      : "text-fg-dim",
                  ].join(" ")}
                >
                  {nodeChip(n)}
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex flex-col min-h-[100px] max-h-[36%] shrink-0 border-b border-edge">
        <SectionTitle>Layers</SectionTitle>
        <div className="flex-1 overflow-y-auto pb-2 font-mono text-[11px]">
          {trees.map((n) => (
            <TreeRow
              key={n.id}
              node={n}
              depth={0}
              selectedRef={selected}
              onSelect={onSelect}
              defaultOpenDepth={2}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function TreeRow({
  node,
  depth,
  selectedRef,
  onSelect,
  defaultOpenDepth,
}: {
  node: TreeNode;
  depth: number;
  selectedRef: HTMLElement | null;
  onSelect: (el: HTMLElement) => void;
  defaultOpenDepth: number;
}) {
  const [open, setOpen] = useState(depth < defaultOpenDepth);
  const rowRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedRef === node.ref;
  const hasChildren = node.children.length > 0;
  // DOM `contains` is O(depth) and short-circuits — much cheaper than
  // recursing through the cloned tree on every TreeRow render.
  const containsSelected =
    !!selectedRef && node.ref.contains(selectedRef);

  useEffect(() => {
    if (containsSelected && !open) setOpen(true);
  }, [containsSelected, open]);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  const isComponent = !!node.componentName;
  return (
    <div>
      <div
        ref={rowRef}
        onClick={() => onSelect(node.ref)}
        className={[
          "flex items-center gap-1 py-0.5 cursor-pointer whitespace-nowrap",
          isSelected
            ? "bg-accent-soft text-accent"
            : isComponent
              ? "hover:bg-panel-2"
              : "hover:bg-panel-2",
        ].join(" ")}
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          className={[
            "inline-grid place-items-center w-3 h-3 shrink-0 text-[8px] text-fg-faint transition-transform",
            hasChildren ? "cursor-pointer" : "opacity-0",
            open ? "rotate-90" : "",
          ].join(" ")}
        >
          ▶
        </span>
        {isComponent ? (
          <>
            <span
              className={[
                "font-semibold tracking-wide text-[12px]",
                isSelected ? "text-accent" : "text-accent",
              ].join(" ")}
            >
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
            {node.domId && (
              <span className="text-amberish">#{node.domId}</span>
            )}
            {node.classes.length > 0 && (
              <span className="text-fg-dim">.{node.classes[0]}</span>
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
            selectedRef={selectedRef}
            onSelect={onSelect}
            defaultOpenDepth={defaultOpenDepth}
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
  recomputeKey,
}: {
  el: HTMLElement;
  tileBody: HTMLElement;
  scale: number;
  recomputeKey: number;
}) {
  const [data, setData] = useState<{
    summary: ElementSummary;
    sections: StyleSection[];
  } | null>(null);

  useEffect(() => {
    const summary = summarizeElement(el, tileBody, scale);
    const sections = buildStyleSections(el, summary.rect);
    setData({ summary, sections });
  }, [el, tileBody, scale, recomputeKey]);

  if (!data) return null;
  const { summary, sections } = data;

  // If the selected element is the root of a captured React component
  // instance, surface that information above the styles.
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

  return (
    <div className="flex-1 overflow-y-auto pb-4">
      {componentName && (
        <SelectedComponentPanel
          name={componentName}
          props={runtimeProps}
        />
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

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
    <span
      className={`absolute text-[11px] text-fg font-mono ${map[pos]}`}
    >
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
