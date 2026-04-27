import { useEffect, useState } from "react";
import { Lock, PenSquare } from "lucide-react";
import type { SpideyNode } from "@spidey/shared";
import { findById, findInstanceAncestor } from "./editor/tree";
import type { EditAction } from "./editor/state";
import { Button } from "@/components/ui/button";
import { PositionSection } from "./inspect/sections/PositionSection";
import { LayoutSection } from "./inspect/sections/LayoutSection";
import { TypographySection } from "./inspect/sections/TypographySection";
import { FillSection } from "./inspect/sections/FillSection";
import { StrokeSection } from "./inspect/sections/StrokeSection";
import { EffectsSection } from "./inspect/sections/EffectsSection";
import { SpacingSection } from "./inspect/sections/SpacingSection";
import { ContentSection } from "./inspect/sections/ContentSection";

type Props = {
  tileId: string | null;
  componentInfo: {
    name: string;
    file: string;
    propsUsed: Record<string, unknown>;
  } | null;
  tree: SpideyNode | null;
  /** Component names the user captured as master tiles. Anything else
   *  (route shells, Next/React internals) is tagged at capture but should
   *  NOT trigger an instance-lock — the lock metaphor only makes sense
   *  for design-system pieces with a "go edit master" target. */
  masterComponentNames: Set<string>;
  selectedNodeId: string | null;
  selectedElement: HTMLElement | null;
  rev: number;
  /** Activate the master tile for the given component name. */
  onEditMaster: (componentName: string) => void;
  dispatch: (action: EditAction) => void;
};

const ASIDE =
  "col-start-3 row-start-1 row-span-2 bg-card border-l border-border flex flex-col min-h-0 overflow-hidden";

/**
 * Right-side properties panel. Figma-style sections (Position, Layout,
 * Typography, Fill, Stroke, Effects) editable inputs that dispatch
 * `setStyle` actions; the read-only Spacing box-model is now editable and
 * pinned at the bottom so it's always visible.
 */
export function Inspector({
  tileId,
  componentInfo,
  tree,
  masterComponentNames,
  selectedNodeId,
  selectedElement,
  rev,
  onEditMaster,
  dispatch,
}: Props) {
  if (!tileId || !tree) {
    return (
      <aside className={ASIDE}>
        <div className="grid place-items-center h-full text-muted-foreground text-center text-xs">
          <div>
            <div className="text-foreground text-sm mb-1">No tile selected</div>
            <div>Click a screen to inspect it</div>
          </div>
        </div>
      </aside>
    );
  }

  const selectedNode = selectedNodeId ? findById(tree, selectedNodeId) : null;
  const isMasterTile = !!componentInfo;
  const rawAncestor =
    !isMasterTile && selectedNodeId
      ? findInstanceAncestor(tree, selectedNodeId)
      : null;
  // Only lock when the ancestor is a tracked design-system component (has a
  // master tile). Layout shells / framework internals get tagged by capture
  // but aren't reusable masters — editing route content inside them should
  // be free, not locked.
  const instanceLock =
    rawAncestor && masterComponentNames.has(rawAncestor.componentName)
      ? rawAncestor
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
      {selectedNodeId && selectedElement ? (
        <StylePanels
          el={selectedElement}
          rev={rev}
          tileId={tileId}
          nodeId={selectedNodeId}
          node={selectedNode && selectedNode.kind === "el" ? selectedNode : null}
          locked={!!instanceLock}
          dispatch={dispatch}
        />
      ) : (
        <div className="p-4 text-muted-foreground text-xs">
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
    <div className="border-b border-border bg-primary/10 px-3 py-2 flex items-center gap-2">
      <Lock size={13} strokeWidth={2} className="text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground flex items-center gap-1.5">
          <span>Instance of</span>
          <span className="font-mono text-primary font-semibold">
            {`<${componentName}>`}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Style edits go on the master.
        </div>
      </div>
      <Button
        size="xs"
        onClick={onEditMaster}
        title={`Open the <${componentName}> master tile`}
        className="shrink-0"
      >
        <PenSquare />
        Edit master
      </Button>
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
    <div className="border-b border-border p-3 bg-background/30">
      <div className="font-mono text-primary text-[14px] font-semibold">
        {`<${name}>`}
      </div>
      {entries.length > 0 ? (
        <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-2 gap-y-1 text-[11px]">
          {entries.map(([k, v]) => (
            <PropRow key={k} name={k} value={v} />
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-muted-foreground/70 italic">
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
    <div className="border-b border-border p-3 bg-background/30 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-primary text-[14px] font-semibold">
          {`<${info.name}>`}
        </span>
        <span className="text-[10px] text-muted-foreground/70 truncate" title={info.file}>
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
        <div className="mt-2 text-[11px] text-muted-foreground/70 italic">no props</div>
      )}
    </div>
  );
}

function PropRow({ name, value }: { name: string; value: unknown }) {
  return (
    <>
      <span className="text-muted-foreground font-mono">{name}</span>
      <span className="text-foreground font-mono break-words min-w-0">
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

function StylePanels({
  el,
  rev,
  tileId,
  nodeId,
  node,
  locked,
  dispatch,
}: {
  el: HTMLElement;
  rev: number;
  tileId: string;
  nodeId: string;
  node: (SpideyNode & { kind: "el" }) | null;
  locked: boolean;
  dispatch: (a: EditAction) => void;
}) {
  // getComputedStyle is reactive only via element identity / rev — recompute
  // when either changes so the inputs' placeholders mirror the live cascade.
  const [computed, setComputed] = useState<CSSStyleDeclaration | null>(null);
  useEffect(() => {
    setComputed(getComputedStyle(el));
  }, [el, rev]);

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

  const setStyle = (prop: string, value: string | null) =>
    dispatch({ type: "setStyle", tileId, nodeId, prop, value });

  const tag = el.tagName.toLowerCase();
  const domId = el.id;
  const classes = Array.from(el.classList);
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  const textPreview = text.length > 80 ? text.slice(0, 77) + "…" : text;

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        {componentName && (
          <SelectedComponentPanel name={componentName} props={runtimeProps} />
        )}
        <div className="p-3 border-b border-border">
          <div className="font-mono text-[13px] text-foreground mb-1.5">
            &lt;{tag}&gt;
            {domId && <span className="text-amber-500 ml-1">#{domId}</span>}
          </div>
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {classes.map((c) => (
                <span
                  key={c}
                  className="bg-muted border border-border text-muted-foreground font-mono text-[11px] px-1.5 py-px rounded-xs"
                >
                  .{c}
                </span>
              ))}
            </div>
          )}
          {textPreview && (
            <div className="text-[11px] text-muted-foreground italic mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
              "{textPreview}"
            </div>
          )}
        </div>

        {!locked && node && (
          <>
            <ContentSection node={node} tileId={tileId} dispatch={dispatch} />
            <PositionSection node={node} computed={computed} setStyle={setStyle} />
            <LayoutSection node={node} computed={computed} setStyle={setStyle} />
            <TypographySection node={node} computed={computed} setStyle={setStyle} />
            <FillSection node={node} computed={computed} setStyle={setStyle} />
            <StrokeSection node={node} computed={computed} setStyle={setStyle} />
            <EffectsSection node={node} computed={computed} setStyle={setStyle} />
          </>
        )}
      </div>
      {!locked && node && (
        <div className="shrink-0 border-t border-border bg-card">
          <SpacingSection node={node} computed={computed} setStyle={setStyle} />
        </div>
      )}
    </>
  );
}
