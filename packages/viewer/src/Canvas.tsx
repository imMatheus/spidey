import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { SpideyNode, SpideyTile } from "@spidey/shared";
import { Tile } from "./Tile";
import type { EditAction, Tool } from "./editor/state";

type Props = {
  tiles: SpideyTile[];
  tileTrees: Record<string, SpideyNode | null>;
  viewport: { width: number; height: number };
  focusId: string | null;
  onClearFocus: () => void;
  activeTileId: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  altPressed: boolean;
  tool: Tool;
  rev: number;
  onActivateTile: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onBodyReady: (tileId: string, body: HTMLElement) => void;
  onScaleChange: (scale: number) => void;
  dispatch: (action: EditAction) => void;
};

type Transform = { x: number; y: number; k: number };

const TILES_PER_ROW = 3;
const GAP = 80;
const HEADER_HEIGHT = 36;
const MIN_K = 0.05;
const MAX_K = 2;
const CLICK_DIST_PX = 5;

export function Canvas({
  tiles,
  tileTrees,
  viewport,
  focusId,
  onClearFocus,
  activeTileId,
  selectedNodeId,
  hoveredNodeId,
  altPressed,
  tool,
  rev,
  onActivateTile,
  onSelectNode,
  onHoverNode,
  onBodyReady,
  onScaleChange,
  dispatch,
}: Props) {
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
    const tileW = viewport.width;
    const map = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >();

    const routes = tiles.filter((p) => (p.kind ?? "route") === "route");
    const components = tiles.filter((p) => p.kind === "component");

    // Column-packed layout for routes: each tile drops into the shortest
    // column. Heights come from containerSize (full document height,
    // measured at capture time) so a long blog post sits in one column
    // without stretching the rest of the row.
    const colY: number[] = new Array(TILES_PER_ROW).fill(0);
    for (const p of routes) {
      let col = 0;
      for (let i = 1; i < TILES_PER_ROW; i++) {
        if (colY[i] < colY[col]) col = i;
      }
      const h = p.containerSize?.height ?? viewport.height;
      const x = col * (tileW + GAP);
      const y = colY[col];
      map.set(p.id, { x, y, w: tileW, h });
      colY[col] += h + HEADER_HEIGHT + GAP;
    }

    // Components live in their own column to the right of the routes
    // columns, stacked at their captured natural sizes.
    const compColumnX = TILES_PER_ROW * (tileW + GAP) + GAP;
    let compY = 0;
    for (const p of components) {
      const w = p.containerSize?.width ?? 320;
      const h = p.containerSize?.height ?? 200;
      map.set(p.id, { x: compColumnX, y: compY, w, h });
      compY += h + HEADER_HEIGHT + GAP;
    }

    return map;
  }, [tiles, viewport]);

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
  // pinches feel smooth without making mouse-wheel zoom violent. Each delta
  // is also clamped so a fast flick can't blow past MIN/MAX_K in one event.
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
          // Cap per-event log change so a single fast tick can't slam from
          // min to max zoom — keeps the gesture incremental.
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
      // Tile-internal drags belong to the Tile (selection/insertion). Pan
      // only when starting from empty canvas.
      if (onTile) return false;
      // In primitive tools, the canvas background should also stay still so
      // the user can only ever interact with tiles.
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
          // Stop tracking — the gesture belongs to a tile or is forbidden.
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
        onActivateTile(null);
        onSelectNode(null);
        onClearFocus();
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
  }, [onActivateTile, onClearFocus, onSelectNode]);

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
    onClearFocus();
  };

  return (
    <div
      className="col-start-2 row-start-2 relative overflow-hidden canvas-grid-bg"
      ref={containerRef}
    >
      {tiles.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-center text-fg-dim">
          <div>
            <div className="text-lg mb-1.5 text-fg">Nothing to show</div>
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
          const active = activeTileId === tile.id;
          const tree = tileTrees[tile.id] ?? tile.tree ?? null;
          return (
            <Tile
              key={tile.id}
              page={tile}
              tree={tree}
              x={pos.x}
              y={pos.y}
              width={pos.w}
              height={pos.h}
              active={active}
              scale={t.k}
              selectedNodeId={active ? selectedNodeId : null}
              hoveredNodeId={active ? hoveredNodeId : null}
              altPressed={altPressed}
              tool={tool}
              rev={rev}
              onActivate={() => onActivateTile(tile.id)}
              onSelectNode={onSelectNode}
              onHoverNode={onHoverNode}
              onBodyReady={onBodyReady}
              dispatch={dispatch}
            />
          );
        })}
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-panel border border-edge rounded-md p-1 z-20">
        <ZoomBtn onClick={() => zoomTo(1.25)} title="Zoom in">
          <ZoomIn size={14} strokeWidth={2} />
        </ZoomBtn>
        <div className="text-[11px] text-fg-dim text-center py-1">
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
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 grid place-items-center rounded border border-edge bg-panel-2 text-fg cursor-pointer hover:bg-[#353535]"
    >
      {children}
    </button>
  );
}
