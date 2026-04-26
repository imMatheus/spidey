import { useEffect, useState, type ReactNode } from "react";
import { Lock, PenSquare } from "lucide-react";
import type { SpideyNode } from "@spidey/shared";
import {
  buildStyleSections,
  summarizeElement,
  type ElementSummary,
  type StyleSection,
} from "./inspect/computeStyles";
import { findById, findInstanceAncestor } from "./editor/tree";
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
  /** Activate the master tile for the given component name. */
  onEditMaster: (componentName: string) => void;
  dispatch: (action: EditAction) => void;
};

const ASIDE =
  "col-start-3 row-start-1 row-span-2 bg-panel border-l border-edge flex flex-col min-h-0 overflow-hidden";

/**
 * Right-side properties panel. Shows the active tile's component metadata
 * (when applicable), an instance-lock banner when the selected node lives
 * inside a component instance in a route tile, and the editable style
 * panels for the selected element.
 *
 * The layers tree + breadcrumb live in the left sidebar (LayersPanel).
 */
export function Inspector({
  tileId,
  componentInfo,
  tree,
  selectedNodeId,
  selectedElement,
  tileBody,
  scale,
  rev,
  onEditMaster,
  dispatch,
}: Props) {
  if (!tileId || !tree) {
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

  const selectedNode = selectedNodeId ? findById(tree, selectedNodeId) : null;
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
      {instanceLock && (
        <InstanceLockBanner
          componentName={instanceLock.componentName}
          onEditMaster={() => onEditMaster(instanceLock.componentName)}
        />
      )}
      {selectedNodeId && selectedElement && tileBody ? (
        <StylePanels
          el={selectedElement}
          tileBody={tileBody}
          scale={scale}
          rev={rev}
          tileId={tileId}
          nodeId={selectedNodeId}
          node={selectedNode && selectedNode.kind === "el" ? selectedNode : null}
          locked={!!instanceLock}
          dispatch={dispatch}
        />
      ) : (
        <div className="p-4 text-fg-dim text-xs">
          Select an element to inspect or edit its styles.
        </div>
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
        ([, v]) => v !== "__spidey_noop__" && typeof v !== "function",
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
  if (Array.isArray(v)) return `[${v.length} item${v.length === 1 ? "" : "s"}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v as object);
    return `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }`;
  }
  return String(v);
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

  // Spacing renders pinned to the bottom of the inspector (outside the
  // scrollable region) so the box-model diagram is always visible no matter
  // how long the rest of the panel gets.
  const spacingSection = sections.find((s) => s.title === "Spacing") ?? null;
  const otherSections = sections.filter((s) => s.title !== "Spacing");

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
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
                className="bg-panel-2 border border-edge text-fg-dim font-mono text-[11px] px-1.5 py-px rounded-xs"
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
            fields={[{ prop: "background", label: "color", kind: "color" }]}
          />
          <EditableStyle
            title="Typography"
            inline={inlineStyle}
            setStyle={setStyle}
            fields={[
              { prop: "color", label: "color", kind: "color" },
              { prop: "font-size", label: "size", kind: "text", placeholder: "16px" },
              { prop: "font-weight", label: "weight", kind: "text", placeholder: "400" },
              {
                prop: "text-align",
                label: "align",
                kind: "select",
                options: ["", "left", "center", "right", "justify"],
              },
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

      {otherSections.map((s) => (
        <SectionBlock key={s.title} section={s} />
      ))}
      </div>
      {spacingSection && (
        <div className="shrink-0 border-t border-edge bg-panel">
          <BoxModelSection section={spacingSection} />
        </div>
      )}
    </>
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
          <FieldRow
            key={f.prop}
            field={f}
            value={inline[f.prop] ?? ""}
            setStyle={setStyle}
          />
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
            className="flex-1 min-w-0 bg-panel-2 border border-edge rounded px-1.5 py-1 text-[11px] font-mono text-fg focus:outline-hidden focus:border-accent"
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
          className="bg-panel-2 border border-edge rounded px-1.5 py-1 text-[11px] font-mono text-fg focus:outline-hidden focus:border-accent"
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
        className="bg-panel-2 border border-edge rounded px-1.5 py-1 text-[11px] font-mono text-fg focus:outline-hidden focus:border-accent"
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
    const toH = (n: number) =>
      Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
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
                className="color-chip inline-block w-3.5 h-3.5 rounded-xs border border-white/20 shrink-0"
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
