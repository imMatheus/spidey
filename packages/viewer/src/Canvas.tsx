import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Tile } from "./Tile";
import { Button } from "@/components/ui/button";
import {
  useEditorState,
  useProject,
  useSelectionActions,
  VIEWPORTS,
} from "./context";

type Props = {
  onScaleChange: (scale: number) => void;
};

type Transform = { x: number; y: number; k: number };

const TILES_PER_ROW = 8;
const GAP = 80;
/** Extra vertical breathing room between the components band and the
 *  routes band — lets the eye see them as separate sections. */
const SECTION_GAP = 160;
const HEADER_HEIGHT = 36;
const MIN_K = 0.05;
const MAX_K = 2;
const CLICK_DIST_PX = 5;

export function Canvas({ onScaleChange }: Props) {
  const { doc, viewport, focusId, setFocusId } = useProject();
  // Selection state itself is consumed by Tile; Canvas only needs setters
  // to clear-on-canvas-click.
  const { setActiveTileId, setSelectedNodeId } = useSelectionActions();
  const editor = useEditorState();
  const tool = editor.tool;

  const tiles = doc?.tiles ?? [];
  const dims = VIEWPORTS[viewport];

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 0.4 });
  // Pan is allowed in select + hand tools; text/rect/image tools need the
  // canvas-background drag to be free for primitive drawing.
  const panToolRef = useRef(tool);
  panToolRef.current = tool;

  // measure container
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onScaleChange(t.k);
  }, [t.k, onScaleChange]);

  const positions = useMemo(() => {
    const map = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >();

    const routes = tiles.filter((p) => (p.kind ?? "route") === "route");
    const components = tiles.filter((p) => p.kind === "component");

    // Components band (top): each tile keeps its natural captured size,
    // dropped into the shortest of TILES_PER_ROW columns. Cell width is
    // the widest component so columns line up visually even when one
    // component (e.g. a card) is much wider than another (e.g. a pill).
    const compNaturalWidths = components.map(
      (p) => p.containerSize?.width ?? 320,
    );
    const compCellW = compNaturalWidths.length
      ? Math.max(...compNaturalWidths)
      : 0;
    const colYComp: number[] = new Array(TILES_PER_ROW).fill(0);
    for (const p of components) {
      let col = 0;
      for (let i = 1; i < TILES_PER_ROW; i++) {
        if (colYComp[i] < colYComp[col]) col = i;
      }
      const w = p.containerSize?.width ?? 320;
      const h = p.containerSize?.height ?? 200;
      const x = col * (compCellW + GAP);
      const y = colYComp[col];
      map.set(p.id, { x, y, w, h });
      colYComp[col] += h + HEADER_HEIGHT + GAP;
    }
    const componentsBandHeight = compNaturalWidths.length
      ? Math.max(...colYComp)
      : 0;

    // Routes band (below components): full-viewport tile width per cell,
    // shortest-column packing so a tall page (longread) doesn't drag the
    // whole row down.
    const routeCellW = dims.width;
    const routesY0 =
      componentsBandHeight > 0 ? componentsBandHeight + SECTION_GAP : 0;
    const colYRoute: number[] = new Array(TILES_PER_ROW).fill(routesY0);
    for (const p of routes) {
      let col = 0;
      for (let i = 1; i < TILES_PER_ROW; i++) {
        if (colYRoute[i] < colYRoute[col]) col = i;
      }
      const h = p.containerSize?.height ?? dims.height;
      const x = col * (routeCellW + GAP);
      const y = colYRoute[col];
      map.set(p.id, { x, y, w: routeCellW, h });
      colYRoute[col] += h + HEADER_HEIGHT + GAP;
    }

    return map;
  }, [tiles, dims]);

  const positionsList = useMemo(
    () => Array.from(positions.values()),
    [positions],
  );

  // initial fit when viewport or tiles change
  useEffect(() => {
    if (!size.w || !size.h || positionsList.length === 0) return;
    const maxX = Math.max(...positionsList.map((p) => p.x + p.w));
    const maxY = Math.max(
      ...positionsList.map((p) => p.y + p.h + HEADER_HEIGHT),
    );
    const k = Math.min((size.w - 80) / maxX, (size.h - 80) / maxY, 1);
    const clamped = Math.max(MIN_K, Math.min(MAX_K, k));
    setT({
      x: (size.w - maxX * clamped) / 2,
      y: (size.h - maxY * clamped) / 2,
      k: clamped,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, tiles.length, size.w, size.h]);

  // focus animation
  useEffect(() => {
    if (!focusId || !size.w || !size.h) return;
    const pos = positions.get(focusId);
    if (!pos) return;
    const targetK = Math.min(
      (size.w - 80) / pos.w,
      (size.h - 80) / (pos.h + HEADER_HEIGHT),
      1,
    );
    const k = Math.max(MIN_K, Math.min(MAX_K, targetK));
    const cx = pos.x + pos.w / 2;
    const cy = pos.y + (pos.h + HEADER_HEIGHT) / 2;
    setT({ x: size.w / 2 - cx * k, y: size.h / 2 - cy * k, k });
  }, [focusId, positions, size.w, size.h]);

  // wheel zoom / pan — Figma-style sensitivity. Trackpad pinch fires wheel
  // events with ctrlKey:true and small per-frame deltaY; mouse wheel ticks
  // come in much bigger chunks. Use one multiplier per source so trackpad
  // pinches feel smooth without making mouse-wheel zoom violent.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setT((prev) => {
        if (e.ctrlKey || e.metaKey) {
          const isMouseWheel =
            e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50;
          const factor = isMouseWheel ? 0.002 : 0.01;
          const raw = -e.deltaY * factor;
          const delta = Math.max(-0.5, Math.min(0.5, raw));
          const newK = Math.max(
            MIN_K,
            Math.min(MAX_K, prev.k * Math.exp(delta)),
          );
          const ratio = newK / prev.k;
          return {
            k: newK,
            x: mx - (mx - prev.x) * ratio,
            y: my - (my - prev.y) * ratio,
          };
        }
        return { ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // drag-vs-click
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let down: {
      x: number;
      y: number;
      t: number;
      onTile: HTMLElement | null;
      panning: boolean;
    } | null = null;

    const canPan = (onTile: boolean) => {
      const t = panToolRef.current;
      if (t === "hand") return true;
      if (onTile) return false;
      if (t === "text" || t === "rect" || t === "image") return false;
      return true;
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const onTile = target?.closest?.(".tile") as HTMLElement | null;
      down = {
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
        onTile,
        panning: false,
      };
    };
    const onMove = (e: MouseEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.panning) {
        if (Math.sqrt(dx * dx + dy * dy) < CLICK_DIST_PX) return;
        if (!canPan(!!down.onTile)) {
          down = null;
          return;
        }
        down.panning = true;
        el.style.cursor = "grabbing";
      }
      down.x = e.clientX;
      down.y = e.clientY;
      setT((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };
    const onUp = (_e: MouseEvent) => {
      if (!down) return;
      const wasClick = !down.panning;
      const onTile = down.onTile;
      el.style.cursor = "";
      const startedOnTile = !!onTile;
      down = null;

      if (wasClick && !startedOnTile) {
        setActiveTileId(null);
        setSelectedNodeId(null);
        setFocusId(null);
      }
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [setActiveTileId, setSelectedNodeId, setFocusId]);

  const zoomTo = (factor: number) => {
    setT((prev) => {
      const newK = Math.max(MIN_K, Math.min(MAX_K, prev.k * factor));
      const ratio = newK / prev.k;
      return {
        k: newK,
        x: size.w / 2 - (size.w / 2 - prev.x) * ratio,
        y: size.h / 2 - (size.h / 2 - prev.y) * ratio,
      };
    });
  };

  const fitAll = () => {
    if (positionsList.length === 0) return;
    const maxX = Math.max(...positionsList.map((p) => p.x + p.w));
    const maxY = Math.max(
      ...positionsList.map((p) => p.y + p.h + HEADER_HEIGHT),
    );
    const k = Math.min((size.w - 80) / maxX, (size.h - 80) / maxY, 1);
    const clamped = Math.max(MIN_K, Math.min(MAX_K, k));
    setT({
      x: (size.w - maxX * clamped) / 2,
      y: (size.h - maxY * clamped) / 2,
      k: clamped,
    });
    setFocusId(null);
  };

  return (
    <div
      className="col-start-2 row-start-2 relative overflow-hidden canvas-grid-bg"
      ref={containerRef}
    >
      {tiles.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-center text-muted-foreground">
          <div>
            <div className="text-lg mb-1.5 text-foreground">Nothing to show</div>
            <div className="text-xs">
              This spidey.json has no tiles.
            </div>
          </div>
        </div>
      )}
      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
      >
        {tiles.map((tile) => {
          const pos = positions.get(tile.id);
          if (!pos) return null;
          return (
            <Tile
              key={tile.id}
              page={tile}
              x={pos.x}
              y={pos.y}
              width={pos.w}
              height={pos.h}
              scale={t.k}
            />
          );
        })}
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-card border border-border rounded-md p-1 z-20">
        <ZoomBtn onClick={() => zoomTo(1.25)} title="Zoom in">
          <ZoomIn size={14} strokeWidth={2} />
        </ZoomBtn>
        <div className="text-[11px] text-muted-foreground text-center py-1">
          {Math.round(t.k * 100)}%
        </div>
        <ZoomBtn onClick={() => zoomTo(0.8)} title="Zoom out">
          <ZoomOut size={14} strokeWidth={2} />
        </ZoomBtn>
        <ZoomBtn onClick={fitAll} title="Fit all">
          <Maximize2 size={13} strokeWidth={2} />
        </ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Button
      onClick={onClick}
      title={title}
      variant="outline"
      size="icon-sm"
    >
      {children}
    </Button>
  );
}
