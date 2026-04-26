import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SpideyPage } from "@spidey/shared";
import { Tile } from "./Tile";
import type { TreeNode } from "./inspect/buildTree";

type Props = {
  pages: SpideyPage[];
  viewport: { width: number; height: number };
  focusId: string | null;
  onClearFocus: () => void;
  activeTileId: string | null;
  selectedElement: HTMLElement | null;
  hoveredElement: HTMLElement | null;
  altPressed: boolean;
  onActivateTile: (id: string | null) => void;
  onSelectElement: (el: HTMLElement | null, tileBody: HTMLElement | null) => void;
  onHoverElement: (el: HTMLElement | null) => void;
  onTreeReady: (id: string, trees: TreeNode[], tileBody: HTMLElement) => void;
  onScaleChange: (scale: number) => void;
};

type Transform = { x: number; y: number; k: number };

const TILES_PER_ROW = 3;
const GAP = 80;
const HEADER_HEIGHT = 36;
const MIN_K = 0.05;
const MAX_K = 2;
const CLICK_DIST_PX = 5;

export function Canvas({
  pages,
  viewport,
  focusId,
  onClearFocus,
  activeTileId,
  selectedElement,
  hoveredElement,
  altPressed,
  onActivateTile,
  onSelectElement,
  onHoverElement,
  onTreeReady,
  onScaleChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [t, setT] = useState<Transform>({ x: 0, y: 0, k: 0.4 });
  const [recomputeKey, setRecomputeKey] = useState(0);

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

  // expose current scale to parent so Inspector can convert coords
  useEffect(() => {
    onScaleChange(t.k);
  }, [t.k, onScaleChange]);

  // Bump recompute key when the captured layout could have changed.
  // Pan/zoom does NOT belong here — overlays render in tile-local coords
  // inside the already-transformed canvas, so they follow naturally.
  useEffect(() => {
    setRecomputeKey((k) => k + 1);
  }, [viewport]);

  // tile positions
  const positions = useMemo(() => {
    const tileW = viewport.width;
    const tileH = viewport.height + HEADER_HEIGHT;
    return pages.map((_p, i) => {
      const col = i % TILES_PER_ROW;
      const row = Math.floor(i / TILES_PER_ROW);
      return {
        x: col * (tileW + GAP),
        y: row * (tileH + GAP),
        w: tileW,
        h: viewport.height,
      };
    });
  }, [pages, viewport]);

  // initial fit when viewport or pages change
  useEffect(() => {
    if (!size.w || !size.h || positions.length === 0) return;
    const maxX = Math.max(...positions.map((p) => p.x + p.w));
    const maxY = Math.max(...positions.map((p) => p.y + p.h + HEADER_HEIGHT));
    const k = Math.min((size.w - 80) / maxX, (size.h - 80) / maxY, 1);
    const clamped = Math.max(MIN_K, Math.min(MAX_K, k));
    setT({
      x: (size.w - maxX * clamped) / 2,
      y: (size.h - maxY * clamped) / 2,
      k: clamped,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, pages.length, size.w, size.h]);

  // focus animation
  useEffect(() => {
    if (!focusId || !size.w || !size.h) return;
    const idx = pages.findIndex((p) => p.id === focusId);
    if (idx < 0) return;
    const pos = positions[idx];
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
  }, [focusId, pages, positions, size.w, size.h]);

  // wheel zoom / pan
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
          const delta = -e.deltaY * 0.0015;
          const newK = Math.max(MIN_K, Math.min(MAX_K, prev.k * Math.exp(delta)));
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
        down.panning = true;
        el.style.cursor = "grabbing";
      }
      down.x = e.clientX;
      down.y = e.clientY;
      setT((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };
    const onUp = (e: MouseEvent) => {
      if (!down) return;
      const wasClick = !down.panning;
      const onTile = down.onTile;
      el.style.cursor = "";
      const startedOnTile = !!onTile;
      down = null;

      if (wasClick && !startedOnTile) {
        // empty-canvas click → deselect & deactivate
        onActivateTile(null);
        onSelectElement(null, null);
        onClearFocus();
      }
      // Inside-tile clicks are handled by Tile itself via shadow listeners.
    };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onActivateTile, onClearFocus, onSelectElement]);

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
    if (positions.length === 0) return;
    const maxX = Math.max(...positions.map((p) => p.x + p.w));
    const maxY = Math.max(...positions.map((p) => p.y + p.h + HEADER_HEIGHT));
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
      {pages.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-center text-fg-dim">
          <div>
            <div className="text-lg mb-1.5 text-fg">Nothing to show</div>
            <div className="text-xs">
              This spidey.json has no pages.
            </div>
          </div>
        </div>
      )}
      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
      >
        {pages.map((page, i) => {
          const pos = positions[i];
          const active = activeTileId === page.id;
          return (
            <Tile
              key={page.id}
              page={page}
              x={pos.x}
              y={pos.y}
              width={pos.w}
              height={pos.h}
              active={active}
              scale={t.k}
              selectedElement={active ? selectedElement : null}
              hoveredElement={active ? hoveredElement : null}
              altPressed={altPressed}
              recomputeKey={recomputeKey}
              onActivate={() => onActivateTile(page.id)}
              onSelectElement={(el, body) => onSelectElement(el, body)}
              onHoverElement={onHoverElement}
              onTreeReady={(trees, body) =>
                onTreeReady(page.id, trees, body)
              }
            />
          );
        })}
      </div>
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-panel border border-edge rounded-md p-1">
        <ZoomBtn onClick={() => zoomTo(1.25)} title="Zoom in">
          +
        </ZoomBtn>
        <div className="text-[11px] text-fg-dim text-center py-1">
          {Math.round(t.k * 100)}%
        </div>
        <ZoomBtn onClick={() => zoomTo(0.8)} title="Zoom out">
          −
        </ZoomBtn>
        <ZoomBtn onClick={fitAll} title="Fit all" small>
          fit
        </ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({
  onClick,
  title,
  children,
  small,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={[
        "w-7 h-7 grid place-items-center rounded border border-edge bg-panel-2 text-fg cursor-pointer hover:bg-[#353535]",
        small ? "text-[11px]" : "text-sm",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
