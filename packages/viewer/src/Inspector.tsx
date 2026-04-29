import { useEffect, useState, useMemo } from "react";
import { Lock, MousePointer2, PenSquare } from "lucide-react";
import type { ComponentSpec, SpideyNode, SpideyTile } from "@spidey/shared";
import { findById, findInstanceAncestor } from "./editor/tree";
import type { EditAction } from "./editor/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PositionSection } from "./inspect/sections/PositionSection";
import { LayoutSection } from "./inspect/sections/LayoutSection";
import { TypographySection } from "./inspect/sections/TypographySection";
import { FillSection } from "./inspect/sections/FillSection";
import { StrokeSection } from "./inspect/sections/StrokeSection";
import { EffectsSection } from "./inspect/sections/EffectsSection";
import { SpacingSection } from "./inspect/sections/SpacingSection";
import { ContentSection } from "./inspect/sections/ContentSection";
import { ValueSection } from "./inspect/sections/ValueSection";
import { PseudoSection } from "./inspect/sections/PseudoSection";
import { PropsSection, type PropsSectionMode } from "./inspect/sections/PropsSection";
import { useRecapture } from "./hooks/useRecapture";
import { useInstanceRecapture } from "./hooks/useInstanceRecapture";
import {
  useEditorDispatch,
  useEditorRev,
  useProject,
  useReadyDoc,
  useSelection,
  useSelectionActions,
  useTileTree,
} from "./context";
import { useSelectedElement } from "./hooks/useSelectedElement";

/**
 * Outer shell mimics the floating shadcn sidebar (rounded card, ring,
 * shadow, surface bg) without sitting inside the SidebarProvider. We
 * deliberately keep it OUT of the provider's machinery so the toolbar's
 * SidebarTrigger only collapses the left sidebar — the right inspector
 * stays put.
 *
 * The `[--sidebar:...]` override mirrors the left sidebar so the right
 * panel reads as the same surface treatment.
 */
const RIGHT_PANEL_OUTER =
  "hidden md:flex shrink-0 h-svh p-2 [--sidebar:var(--color-background)] dark:[--sidebar:var(--color-surface)]";
const RIGHT_PANEL_INNER =
  "flex w-full flex-col bg-sidebar text-sidebar-foreground rounded-lg shadow-sm ring-1 ring-sidebar-border overflow-hidden";
const RIGHT_PANEL_WIDTH = { width: "21rem" } as React.CSSProperties;

/**
 * Right-side properties panel. Figma-style sections (Position, Layout,
 * Typography, Fill, Stroke, Effects) editable inputs that dispatch
 * `setStyle` actions; the read-only Spacing box-model is now editable and
 * pinned at the bottom so it's always visible.
 *
 * Reads selection + active tile from context; resolves component info /
 * master-component names from the loaded doc; pulls the live HTMLElement
 * via `useSelectedElement`.
 */
export function Inspector() {
  const dispatch = useEditorDispatch();
  const doc = useReadyDoc();
  const rev = useEditorRev();
  const { activeTileId, selectedNodeId } = useSelection();
  const { setActiveTileId, setSelectedNodeId } = useSelectionActions();
  const { setFocusId } = useProject();
  const tree = useTileTree(activeTileId);
  const selectedElement = useSelectedElement();

  const docTiles = doc.tiles ?? [];
  const activeTile: SpideyTile | null =
    activeTileId != null
      ? docTiles.find((p) => p.id === activeTileId) ?? null
      : null;
  const componentInfo =
    activeTile?.kind === "component" ? activeTile.component ?? null : null;

  // Names of components captured as masters. Spidey's capture phase tags
  // every named React fiber (including framework internals like
  // InnerLayoutRouter), but the inspector should only treat ancestors as
  // instance-locked when there's a master tile to "go edit".
  const masterComponentNames = useMemo(() => {
    return new Set<string>(
      docTiles
        .filter(
          (t): t is typeof t & { component: { name: string } } =>
            t.kind === "component" && !!t.component?.name,
        )
        .map((t) => t.component.name),
    );
  }, [docTiles]);

  const onEditMaster = (componentName: string) => {
    const master = docTiles.find(
      (t) => t.kind === "component" && t.component?.name === componentName,
    );
    if (master) {
      setActiveTileId(master.id);
      setFocusId(master.id);
      setSelectedNodeId(null);
    }
  };

  if (!activeTileId || !tree) {
    return (
      <aside className={RIGHT_PANEL_OUTER} style={RIGHT_PANEL_WIDTH}>
        <div className={RIGHT_PANEL_INNER}>
          <div className="grid place-items-center h-full text-center px-6">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <MousePointer2 size={20} strokeWidth={1.5} />
              <div className="text-foreground text-[13px] font-medium">
                No tile selected
              </div>
              <div className="text-[12px]">Click a screen to inspect it</div>
            </div>
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
  // Lock only when the ancestor is a tracked design-system component (has a
  // master tile). Layout shells / framework internals get tagged by capture
  // but aren't reusable masters.
  const instanceLock =
    rawAncestor && masterComponentNames.has(rawAncestor.componentName)
      ? rawAncestor
      : null;

  return (
    <aside className={RIGHT_PANEL_OUTER} style={RIGHT_PANEL_WIDTH}>
      <div className={cn(RIGHT_PANEL_INNER, "min-h-0")}>
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
            tileId={activeTileId}
            nodeId={selectedNodeId}
            node={selectedNode && selectedNode.kind === "el" ? selectedNode : null}
            locked={!!instanceLock}
            dispatch={dispatch}
            masterComponent={componentInfo}
            masterPropsUsed={
              componentInfo
                ? (activeTile?.component?.propsUsed ?? null)
                : null
            }
            componentsCatalog={doc.components ?? []}
          />
        ) : (
          <div className="px-4 py-3 text-muted-foreground text-[12px]">
            Select an element to inspect or edit its styles.
          </div>
        )}
      </div>
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
    <div className="border-b border-border bg-muted/40 px-4 py-2 flex items-center gap-2">
      <Lock size={13} strokeWidth={2} className="text-amber-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-foreground flex items-center gap-1.5">
          <span>Instance of</span>
          <span className="font-mono font-semibold">
            {`<${componentName}>`}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground">
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

function ComponentHeader({
  info,
}: {
  info: { name: string; file: string; propsUsed: Record<string, unknown> };
}) {
  const props = Object.entries(info.propsUsed).filter(
    ([, v]) => v !== "__spidey_noop__",
  );
  return (
    <div className="border-b border-border px-4 py-3 shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-foreground text-[13px] font-semibold">
          {`<${info.name}>`}
        </span>
        <span className="text-[11px] text-muted-foreground truncate" title={info.file}>
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
  masterComponent,
  masterPropsUsed,
  componentsCatalog,
}: {
  el: HTMLElement;
  rev: number;
  tileId: string;
  nodeId: string;
  node: (SpideyNode & { kind: "el" }) | null;
  locked: boolean;
  dispatch: (a: EditAction) => void;
  /** When non-null, the active tile is a component master; this is its
   *  component info (name/file/propsUsed). Used together with the
   *  selection check below to decide whether the props section runs in
   *  master-mode (recapture-on-edit) or instance-mode (attribute-edit). */
  masterComponent: { name: string; file: string; propsUsed: Record<string, unknown> } | null;
  /** Latest propsUsed from the doc (separate from masterComponent so it
   *  re-reads after an optimistic update without rebuilding the whole
   *  componentInfo object). */
  masterPropsUsed: Record<string, unknown> | null;
  /** Discovered component catalog from the doc — used to resolve the
   *  selected component's prop signature (enums → dropdowns, etc). */
  componentsCatalog: ComponentSpec[];
}) {
  // getComputedStyle is reactive only via element identity / rev — recompute
  // when either changes so the inputs' placeholders mirror the live cascade.
  const [computed, setComputed] = useState<CSSStyleDeclaration | null>(null);
  useEffect(() => {
    setComputed(getComputedStyle(el));
  }, [el, rev]);

  const { recapture, pending, error } = useRecapture();
  const {
    recapture: recaptureInstance,
    pending: instancePending,
    error: instanceError,
  } = useInstanceRecapture();

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

  // Master-mode applies when the active tile is a master AND the
  // selected element is the topmost match for its component. Nested
  // instances (e.g. a <Button> inside a <Card> master tile) fall back
  // to instance-mode — those edits target the inner data-spidey-props,
  // not the master's propsUsed.
  const isMasterRoot = (() => {
    if (!masterComponent || !componentName) return false;
    if (componentName !== masterComponent.name) return false;
    let p = el.parentElement;
    while (p) {
      if (p.getAttribute?.("data-spidey-component") === componentName)
        return false;
      p = p.parentElement;
    }
    return true;
  })();

  // Catalog entry for the selected component, when one exists. Required
  // by the instance-recapture path: the server needs the spec
  // (file/exportKind/props) to write a single-component preview. When
  // the catalog has no match (e.g. framework internals like Router
  // that capture tags but aren't user components) we fall back to
  // attribute-only edits.
  const componentCatalogEntry = componentName
    ? componentsCatalog.find((c) => c.name === componentName)
    : undefined;

  const propsMode: PropsSectionMode | null = !componentName
    ? null
    : isMasterRoot
      ? {
          kind: "master",
          onCommit: (next) => {
            void recapture(tileId, next);
          },
          pending,
          error,
        }
      : {
          kind: "instance",
          onCommit: (next) => {
            // Optimistic attribute write so the inspector inputs reflect
            // the user's typing without waiting on the recapture
            // roundtrip. The recapture's resulting subtree carries its
            // own data-spidey-props that will overwrite this on land.
            dispatch({
              type: "setAttr",
              tileId,
              nodeId,
              name: "data-spidey-props",
              value: JSON.stringify(next),
            });
            // Re-render the instance via the same preview pipeline as
            // the master flow when the component is in the discovered
            // catalog. Without a spec the server can't render — leave
            // the attribute-only edit (still recorded in the change
            // log for the agent handoff).
            if (componentCatalogEntry) {
              void recaptureInstance(
                tileId,
                nodeId,
                componentName,
                next,
                componentCatalogEntry.relPath,
              );
            }
          },
          onRawCommit: (text) =>
            dispatch({
              type: "setAttr",
              tileId,
              nodeId,
              name: "data-spidey-props",
              value: text,
            }),
          pending: instancePending,
          error: instanceError,
        };

  // For master-mode, parsed props come from the doc (live, mutable).
  // For instance-mode, they come from the captured attribute on the
  // selected element (read-only DOM, but the gesture log persists edits
  // to data-spidey-props on dispatch).
  const parsedProps = isMasterRoot ? masterPropsUsed : runtimeProps;

  // Look up the discovered prop signature so the section can render
  // enums as dropdowns, etc. Match by name; multiple components can
  // share a name across files but the catalog is small enough that a
  // first-match is fine for v1.
  const propSpec = componentName
    ? componentsCatalog.find((c) => c.name === componentName)?.props
    : undefined;

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
        {componentName && propsMode && (
          <PropsSection
            name={componentName}
            rawAttr={propsAttr}
            parsed={parsedProps}
            mode={propsMode}
            propSpecs={propSpec}
          />
        )}
        <div className="px-4 py-3 border-b border-border">
          <div className="font-mono text-[13px] text-foreground font-semibold">
            &lt;{tag}&gt;
            {domId && (
              <span className="text-amber-500 ml-1 font-normal">#{domId}</span>
            )}
          </div>
          {classes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {classes.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="font-mono text-[10px] text-muted-foreground rounded-sm"
                >
                  .{c}
                </Badge>
              ))}
            </div>
          )}
          {textPreview && (
            <div className="text-[11px] text-muted-foreground italic mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
              "{textPreview}"
            </div>
          )}
        </div>

        {!locked && node && (
          <>
            <ContentSection node={node} tileId={tileId} dispatch={dispatch} />
            <ValueSection node={node} tileId={tileId} dispatch={dispatch} />
            <PositionSection node={node} computed={computed} setStyle={setStyle} />
            <LayoutSection node={node} computed={computed} setStyle={setStyle} />
            <TypographySection node={node} computed={computed} setStyle={setStyle} />
            <FillSection node={node} computed={computed} setStyle={setStyle} />
            <StrokeSection node={node} computed={computed} setStyle={setStyle} />
            <EffectsSection node={node} computed={computed} setStyle={setStyle} />
            <PseudoSection el={el} />
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
