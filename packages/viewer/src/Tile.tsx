import { useEffect, useRef } from "react";
import type { SpideyNode, SpideyTile } from "@spidey/shared";
import { findById, findInstanceAncestor } from "./editor/tree";
import { renderNode } from "./editor/render";
import { newId, type Tool } from "./editor/state";
import type { EditAction } from "./editor/state";
import { SelectionOverlay } from "./SelectionOverlay";

type Props = {
  page: SpideyTile;
  tree: SpideyNode | null;
  width: number;
  height: number;
  x: number;
  y: number;
  active: boolean;
  /** Current canvas scale; used to keep the active ring visible at low zoom */
  scale: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  altPressed: boolean;
  tool: Tool;
  rev: number;
  onActivate: () => void;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onBodyReady: (tileId: string, body: HTMLElement) => void;
  dispatch: (action: EditAction) => void;
};

const CLICK_TIME_MS = 350;
const CLICK_DIST_PX = 5;
const DBL_CLICK_MS = 350;

function applyAttrs(
  el: Element,
  attrs: Record<string, string> | undefined,
): void {
  if (!attrs) return;
  for (const [name, value] of Object.entries(attrs)) {
    if (name.toLowerCase().startsWith("on")) continue;
    try {
      el.setAttribute(name, value);
    } catch {
      // ignore exotic attribute names
    }
  }
}

export function Tile({
  page,
  tree,
  width,
  height,
  x,
  y,
  active,
  scale,
  selectedNodeId,
  hoveredNodeId,
  altPressed,
  tool,
  rev,
  onActivate,
  onSelectNode,
  onHoverNode,
  onBodyReady,
  dispatch,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyWrapperRef = useRef<HTMLDivElement>(null);
  /** The synthesized <body> inside the shadow root. Set during shell-mount,
   *  exposed up to App via onBodyReady so node-id ↔ HTMLElement lookups
   *  have a stable starting point. */
  const synthBodyRef = useRef<HTMLElement | null>(null);
  /** Last-down state — used by drag-vs-click and rectangle-rubber-band. */
  const downRef = useRef<{
    x: number;
    y: number;
    t: number;
    nodeId: string | null;
  } | null>(null);
  const lastClickAt = useRef(0);
  const rubberRef = useRef<HTMLDivElement | null>(null);

  // ----- Shell mount (page identity changed) -----
  // Mount only the shadow shell here: reset, captured CSS, synth html/body
  // with attrs. Tree contents are populated by the tree-effect below.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let shadow = host.shadowRoot;
    if (!shadow) shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";

    if (page.status === "error") {
      synthBodyRef.current = null;
      return;
    }

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
      [data-spidey-id][contenteditable="true"] { outline: 2px solid rgba(91,140,255,0.7); outline-offset: 1px; cursor: text; }
    `;
    shadow.appendChild(reset);

    if (page.css) {
      const style = document.createElement("style");
      // `:root` doesn't match inside a shadow root — rewrite to `:host` so
      // CSS-variable declarations and theme rules continue to apply.
      style.textContent = page.css.replace(/:root\b/g, ":host");
      shadow.appendChild(style);
    }

    const synthHtml = document.createElement("html");
    applyAttrs(synthHtml, page.htmlAttrs);
    const synthBody = document.createElement("body");
    applyAttrs(synthBody, page.bodyAttrs);
    synthHtml.appendChild(synthBody);
    shadow.appendChild(synthHtml);

    synthBodyRef.current = synthBody;
    onBodyReady(page.id, synthBody);
    // We intentionally exclude onBodyReady from deps — Canvas may pass a
    // freshly-bound lambda on every render, and a re-firing shell-mount
    // would wipe the body without re-firing the (independent) tree-mount
    // effect. Capture the callback via the latest closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, page.status, page.css, page.bodyAttrs, page.htmlAttrs]);

  // ----- Tree mount (tree reference changed) -----
  useEffect(() => {
    const body = synthBodyRef.current;
    if (!body) return;
    body.innerHTML = "";
    if (!tree || tree.kind !== "el") return;

    // The captured body is the tree root — render its CHILDREN into our
    // synthesized body so we don't end up with a body-inside-body.
    for (const child of tree.children) {
      body.appendChild(renderNode(child));
    }

    // Defang anchors so clicks don't navigate, and forms so submits don't
    // reload the viewer.
    body.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("data-href", a.getAttribute("href") ?? "");
      a.removeAttribute("href");
      (a as HTMLElement).style.cursor = "default";
    });
    body.querySelectorAll("form").forEach((f) => {
      f.addEventListener("submit", (e) => e.preventDefault());
    });
  }, [tree, page.id]);

  // ----- Pointer/keyboard handlers in shadow root -----
  useEffect(() => {
    const host = hostRef.current;
    if (!host?.shadowRoot) return;
    const root = host.shadowRoot;
    const body = synthBodyRef.current;

    const isInsideContent = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      if (target === body) return null;
      return target;
    };

    // Coords helper: client → tile-local pixels.
    const tileLocal = (clientX: number, clientY: number) => {
      if (!body) return { x: 0, y: 0 };
      const r = body.getBoundingClientRect();
      const sx = r.width / (body.clientWidth || 1);
      const sy = r.height / (body.clientHeight || 1);
      return { x: (clientX - r.left) / (sx || 1), y: (clientY - r.top) / (sy || 1) };
    };

    const onMouseOver = (e: MouseEvent) => {
      if (!active) return;
      if (tool !== "select") return;
      const el = isInsideContent(e.composedPath()[0] as HTMLElement);
      if (!el) {
        onHoverNode(null);
        return;
      }
      onHoverNode(el.getAttribute("data-spidey-id"));
    };
    const onMouseOut = (e: MouseEvent) => {
      if (!active) return;
      if (tool !== "select") return;
      const next = e.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      onHoverNode(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (tool === "hand") return; // let canvas pan
      // Track down for click vs drag detection. For rect tool, additionally
      // start a rubber-band overlay.
      const target = e.composedPath()[0] as HTMLElement | null;
      const id = target?.getAttribute?.("data-spidey-id") ?? null;
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), nodeId: id };

      if (tool === "rect" && body) {
        // create a transient overlay element on the body for rubber-band
        const overlay = document.createElement("div");
        overlay.style.cssText =
          "position:absolute; pointer-events:none; border:1px dashed #5b8cff; background:rgba(91,140,255,0.15); z-index: 99999;";
        const local = tileLocal(e.clientX, e.clientY);
        overlay.style.left = `${local.x}px`;
        overlay.style.top = `${local.y}px`;
        overlay.style.width = "0px";
        overlay.style.height = "0px";
        overlay.dataset.spideyRubber = "1";
        body.appendChild(overlay);
        rubberRef.current = overlay;
        e.preventDefault();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      const start = downRef.current;
      if (!start) return;
      if (tool === "rect" && rubberRef.current) {
        const a = tileLocal(start.x, start.y);
        const b = tileLocal(e.clientX, e.clientY);
        const left = Math.min(a.x, b.x);
        const top = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        rubberRef.current.style.left = `${left}px`;
        rubberRef.current.style.top = `${top}px`;
        rubberRef.current.style.width = `${w}px`;
        rubberRef.current.style.height = `${h}px`;
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      const start = downRef.current;
      downRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dt = Date.now() - start.t;
      const wasClick = dist <= CLICK_DIST_PX && dt <= CLICK_TIME_MS;

      // Activation gate: any pointer up on a non-active tile activates it
      // and stops further interpretation.
      if (!active) {
        if (wasClick) onActivate();
        if (rubberRef.current) {
          rubberRef.current.remove();
          rubberRef.current = null;
        }
        return;
      }

      const target = e.composedPath()[0] as HTMLElement | null;

      if (tool === "rect") {
        const overlay = rubberRef.current;
        rubberRef.current = null;
        if (overlay) {
          const a = tileLocal(start.x, start.y);
          const b = tileLocal(e.clientX, e.clientY);
          const left = Math.min(a.x, b.x);
          const top = Math.min(a.y, b.y);
          let w = Math.abs(b.x - a.x);
          let h = Math.abs(b.y - a.y);
          // single click → default size
          if (w < 4 && h < 4) {
            w = 120;
            h = 80;
          }
          overlay.remove();
          if (tree && tree.kind === "el") {
            const node: SpideyNode = makeRectNode(left, top, w, h);
            dispatch({
              type: "insertNode",
              tileId: page.id,
              parentId: tree.id,
              index: tree.children.length,
              node,
            });
            onSelectNode(node.id);
          }
        }
        return;
      }

      if (tool === "text" && wasClick) {
        const local = tileLocal(e.clientX, e.clientY);
        if (tree && tree.kind === "el") {
          const node: SpideyNode = makeTextNode(local.x, local.y, "Text");
          dispatch({
            type: "insertNode",
            tileId: page.id,
            parentId: tree.id,
            index: tree.children.length,
            node,
          });
          onSelectNode(node.id);
        }
        return;
      }

      if (tool === "image" && wasClick) {
        const local = tileLocal(e.clientX, e.clientY);
        if (tree && tree.kind === "el") {
          const node: SpideyNode = makeImageNode(local.x, local.y, 200, 140);
          dispatch({
            type: "insertNode",
            tileId: page.id,
            parentId: tree.id,
            index: tree.children.length,
            node,
          });
          onSelectNode(node.id);
        }
        return;
      }

      if (tool === "select" && wasClick) {
        const el = isInsideContent(target);
        const id = el?.getAttribute("data-spidey-id") ?? null;

        // Detect double-click to enter inline text edit.
        const now = Date.now();
        const isDouble = now - lastClickAt.current < DBL_CLICK_MS;
        lastClickAt.current = now;
        if (isDouble && id && tree) {
          // Lock text edits inside component instances when this tile is a
          // route — text on instances is per-instance data and isn't
          // user-editable for v1 (the user explicitly chose locked
          // instances; the master tile is where edits live).
          const isRoute = page.kind !== "component";
          const lockedInInstance =
            isRoute && !!findInstanceAncestor(tree, id);
          if (!lockedInInstance) {
            maybeStartTextEdit(id, el!, tree, page.id, dispatch);
          }
          return;
        }

        onSelectNode(id);
      }
    };

    const target = root as unknown as EventTarget;
    target.addEventListener("mouseover", onMouseOver as EventListener);
    target.addEventListener("mouseout", onMouseOut as EventListener);
    target.addEventListener("mousedown", onMouseDown as EventListener);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      target.removeEventListener("mouseover", onMouseOver as EventListener);
      target.removeEventListener("mouseout", onMouseOut as EventListener);
      target.removeEventListener("mousedown", onMouseDown as EventListener);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [active, tool, tree, page.id, onActivate, onSelectNode, onHoverNode, dispatch]);

  const headerHeight = 36;
  const isErr = page.status === "error";

  // Ring width is in canvas-local pixels; the canvas is then CSS-scaled.
  // Compensate so the ring always reads ~2 viewport px regardless of zoom.
  const ringPx = Math.max(1, 2 / Math.max(scale, 0.05));

  return (
    <div
      className={[
        "tile absolute rounded-md overflow-hidden border transition-shadow transition-colors duration-150",
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
        ref={bodyWrapperRef}
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
                tileBody={bodyWrapperRef.current}
                synthBody={synthBodyRef.current}
                selectedNodeId={selectedNodeId}
                hoveredNodeId={hoveredNodeId}
                altPressed={altPressed}
                rev={rev}
                tool={tool}
                tileId={page.id}
                tree={tree}
                dispatch={dispatch}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --------- helpers ---------

function makeRectNode(
  x: number,
  y: number,
  w: number,
  h: number,
): SpideyNode {
  return {
    id: newId(),
    kind: "el",
    tag: "div",
    attrs: { "data-spidey-primitive": "rect" },
    style: {
      position: "absolute",
      left: `${Math.round(x)}px`,
      top: `${Math.round(y)}px`,
      width: `${Math.round(w)}px`,
      height: `${Math.round(h)}px`,
      background: "#5b8cff",
      "border-radius": "6px",
    },
    children: [],
  };
}

function makeTextNode(x: number, y: number, value: string): SpideyNode {
  return {
    id: newId(),
    kind: "el",
    tag: "div",
    attrs: { "data-spidey-primitive": "text" },
    style: {
      position: "absolute",
      left: `${Math.round(x)}px`,
      top: `${Math.round(y)}px`,
      color: "#1a1a1a",
      "font-size": "16px",
      "font-family": "inherit",
      "min-width": "40px",
    },
    children: [{ id: newId(), kind: "text", value }],
  };
}

function makeImageNode(
  x: number,
  y: number,
  w: number,
  h: number,
): SpideyNode {
  // 1px transparent gif; user replaces via the style panel.
  const placeholder =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none'><rect width='100%' height='100%' fill='%23eef0f4'/><path d='M0 0L${w} ${h}M${w} 0L0 ${h}' stroke='%23bbb' stroke-width='1'/></svg>`,
    );
  return {
    id: newId(),
    kind: "el",
    tag: "img",
    attrs: { src: placeholder, alt: "", "data-spidey-primitive": "image" },
    style: {
      position: "absolute",
      left: `${Math.round(x)}px`,
      top: `${Math.round(y)}px`,
      width: `${Math.round(w)}px`,
      height: `${Math.round(h)}px`,
    },
    children: [],
  };
}

function maybeStartTextEdit(
  nodeId: string,
  target: HTMLElement,
  tree: SpideyNode,
  tileId: string,
  dispatch: (action: EditAction) => void,
): void {
  const node = findById(tree, nodeId);
  if (!node || node.kind !== "el") return;

  // Find a text-only element to edit. Walk up if necessary: if the clicked
  // target is a deep child without text, prefer the nearest text-only
  // ancestor inside this same node. Keep it simple: only handle the case
  // where the clicked element directly contains exactly one text child.
  const textChildren = node.children.filter((c) => c.kind === "text");
  if (textChildren.length === 0 || textChildren.length !== node.children.length) {
    return;
  }
  const textNode = textChildren[0];

  target.setAttribute("contenteditable", "true");
  // Select the contents so the user can immediately overtype.
  try {
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch {
    // ignore — selection across shadow boundaries is finicky
  }
  target.focus();

  const finish = () => {
    target.removeAttribute("contenteditable");
    target.removeEventListener("blur", finish);
    target.removeEventListener("keydown", onKey);
    const next = target.textContent ?? "";
    if (next !== textNode.value) {
      dispatch({ type: "setText", tileId, nodeId: textNode.id, text: next });
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // revert
      target.textContent = textNode.value;
      target.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      target.blur();
    }
  };
  target.addEventListener("blur", finish);
  target.addEventListener("keydown", onKey);
}
