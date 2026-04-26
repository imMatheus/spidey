import { useEffect, useRef } from "react";
import type { SpideyPage } from "@spidey/shared";
import { buildTree, type TreeNode } from "./inspect/buildTree";
import { SelectionOverlay } from "./SelectionOverlay";

type Props = {
  page: SpideyPage;
  width: number;
  height: number;
  x: number;
  y: number;
  active: boolean;
  /** Current canvas scale; used to keep the active ring visible at low zoom */
  scale: number;
  selectedElement: HTMLElement | null;
  hoveredElement: HTMLElement | null;
  altPressed: boolean;
  recomputeKey: number;
  onActivate: () => void;
  onSelectElement: (el: HTMLElement | null, tileBody: HTMLElement) => void;
  onHoverElement: (el: HTMLElement | null) => void;
  onTreeReady: (trees: TreeNode[], tileBody: HTMLElement) => void;
};

const CLICK_TIME_MS = 350;
const CLICK_DIST_PX = 5;

function applyAttrs(
  el: Element,
  attrs: Record<string, string> | undefined,
): void {
  if (!attrs) return;
  for (const [name, value] of Object.entries(attrs)) {
    // Defense in depth — capture already strips on*, but the JSON could
    // come from elsewhere.
    if (name.toLowerCase().startsWith("on")) continue;
    try {
      el.setAttribute(name, value);
    } catch {
      // Some attribute names (e.g. ones with weird characters from
      // exotic frameworks) may throw; skip silently.
    }
  }
}

export function Tile({
  page,
  width,
  height,
  x,
  y,
  active,
  scale,
  selectedElement,
  hoveredElement,
  altPressed,
  recomputeKey,
  onActivate,
  onSelectElement,
  onHoverElement,
  onTreeReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  /** The wrapper <div> we mount the captured HTML into. We keep a ref to
   *  it so click/hover handlers can ignore events whose target IS the
   *  wrapper itself (rather than guessing via DOM-shape heuristics). */
  const containerRef = useRef<HTMLElement | null>(null);

  // Mount captured HTML/CSS into shadow DOM whenever the page changes
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let shadow = host.shadowRoot;
    if (!shadow) shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";

    if (page.status === "error") return;

    // Reset establishes the host's clean baseline + a default sizing for
    // the synthesized html/body wrappers below. User CSS still wins via
    // normal cascade order (it's appended after this).
    const reset = document.createElement("style");
    reset.textContent = `
      :host { all: initial; display: block; width: 100%; height: 100%; }
      :host * { box-sizing: border-box; }
      html, body {
        display: block;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        overflow: auto;
      }
    `;
    shadow.appendChild(reset);

    if (page.css) {
      const style = document.createElement("style");
      // Inside a shadow root, `:root` matches nothing (the document root
      // is outside the shadow). Rewrite it to `:host` so CSS-variable
      // declarations and theme rules continue to apply.
      style.textContent = page.css.replace(/:root\b/g, ":host");
      shadow.appendChild(style);
    }

    // Synthesize <html><body> inside the shadow so global selectors
    // (`body { ... }`, `html { ... }`, `body.dark`, `html[lang="en"]`)
    // match against real elements. Carry over the captured attributes so
    // attribute-keyed theming continues to work.
    const synthHtml = document.createElement("html");
    applyAttrs(synthHtml, page.htmlAttrs);
    const synthBody = document.createElement("body");
    applyAttrs(synthBody, page.bodyAttrs);
    synthBody.innerHTML = page.html;
    containerRef.current = synthBody;

    synthBody.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("data-href", a.getAttribute("href") ?? "");
      a.removeAttribute("href");
      (a as HTMLElement).style.cursor = "default";
    });
    synthBody.querySelectorAll("form").forEach((f) => {
      f.addEventListener("submit", (e) => e.preventDefault());
    });

    synthHtml.appendChild(synthBody);
    shadow.appendChild(synthHtml);
  }, [page]);

  // Build the tree once mounted (and whenever the page/viewport changes)
  useEffect(() => {
    if (page.status === "error") return;
    if (!bodyRef.current) return;
    const host = hostRef.current;
    if (!host?.shadowRoot) return;

    // Wait one frame for layout to settle. Build from the captured-content
    // wrapper rather than the shadow root, so the inspector shows the page's
    // real top-level elements without our synthetic wrapper as a layer.
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      if (!bodyRef.current) return;
      const root = containerRef.current ?? host.shadowRoot;
      if (!root) return;
      const trees = buildTree(root);
      onTreeReady(trees, bodyRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [page, width, height, onTreeReady]);

  // Hover + click in shadow DOM (only meaningful when this tile is active)
  useEffect(() => {
    const host = hostRef.current;
    if (!host?.shadowRoot) return;
    const root = host.shadowRoot;

    const isInside = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      if (target === containerRef.current) return null;
      return target;
    };

    const onMouseOver = (e: MouseEvent) => {
      if (!active) return;
      const el = isInside(e.composedPath()[0] as HTMLElement);
      if (!el) return;
      onHoverElement(el);
    };
    const onMouseOut = (e: MouseEvent) => {
      if (!active) return;
      // Only clear when leaving to outside the shadow
      const next = e.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      onHoverElement(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };
    const onMouseUp = (e: MouseEvent) => {
      const start = downRef.current;
      downRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = Date.now() - start.t;
      if (dist > CLICK_DIST_PX || dt > CLICK_TIME_MS) return; // drag, not click

      const target = e.composedPath()[0] as HTMLElement | null;
      const body = bodyRef.current;
      if (!body) return;

      if (!active) {
        onActivate();
        return;
      }
      const el = isInside(target);
      onSelectElement(el, body);
    };

    const target = root as unknown as EventTarget;
    target.addEventListener("mouseover", onMouseOver as EventListener);
    target.addEventListener("mouseout", onMouseOut as EventListener);
    target.addEventListener("mousedown", onMouseDown as EventListener);
    target.addEventListener("mouseup", onMouseUp as EventListener);

    return () => {
      target.removeEventListener("mouseover", onMouseOver as EventListener);
      target.removeEventListener("mouseout", onMouseOut as EventListener);
      target.removeEventListener("mousedown", onMouseDown as EventListener);
      target.removeEventListener("mouseup", onMouseUp as EventListener);
    };
  }, [active, onHoverElement, onSelectElement, onActivate]);

  const headerHeight = 36;

  const isErr = page.status === "error";

  // Ring width is in canvas-local pixels; the canvas is then CSS-scaled.
  // Compensate so the ring always reads ~2 viewport px regardless of zoom.
  const ringPx = Math.max(1, 2 / Math.max(scale, 0.05));
  return (
    <div
      className={[
        "absolute rounded-md overflow-hidden border transition-shadow transition-colors duration-150",
        isErr ? "bg-[#2c1f1f]" : "bg-white",
        active ? "border-accent" : "border-edge",
      ].join(" ")}
      style={{
        left: x,
        top: y,
        width,
        height: height + headerHeight,
        boxShadow: active
          ? `0 4px 24px rgba(0,0,0,0.4), 0 0 0 ${ringPx}px rgba(91,140,255,0.45)`
          : "0 4px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div
        className="bg-panel-2 text-fg px-3 py-2 text-xs font-medium flex justify-between items-center gap-2"
        style={{ height: headerHeight }}
      >
        {page.kind === "component" ? (
          <span className="font-mono text-accent whitespace-nowrap overflow-hidden text-ellipsis">
            {`<${page.component?.name ?? "Component"}>`}
          </span>
        ) : (
          <span className="font-mono whitespace-nowrap overflow-hidden text-ellipsis">
            {page.route}
          </span>
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {page.kind === "component" && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-accent-soft text-accent uppercase tracking-[0.5px]">
              component
            </span>
          )}
          {isErr && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-danger/20 text-[#ff8a8a] uppercase tracking-[0.5px]">
              error
            </span>
          )}
        </div>
      </div>
      <div
        ref={bodyRef}
        className="relative bg-white overflow-hidden"
        style={{ width, height }}
      >
        {isErr ? (
          <div className="p-4 font-mono text-[11px] text-[#ff8a8a] bg-[#2c1f1f] whitespace-pre-wrap break-words">
            {page.error ?? "capture failed"}
          </div>
        ) : (
          <>
            <div ref={hostRef} className="block w-full h-full" />
            {active && (
              <SelectionOverlay
                tileBody={bodyRef.current}
                selected={selectedElement}
                hovered={hoveredElement}
                altPressed={altPressed}
                recomputeKey={recomputeKey}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
