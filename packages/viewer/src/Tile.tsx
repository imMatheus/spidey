import { useEffect, useRef } from "react";
import type { SpideyNode, SpideyTile } from "@spidey/shared";
import { findById, findInstanceAncestor, findParent } from "./editor/tree";
import { renderNode } from "./editor/render";
import { newId } from "./editor/state";
import { SelectionOverlay } from "./SelectionOverlay";
import {
  useEditorDispatch,
  useEditorRev,
  useEditorState,
  useProject,
  useRegisterTileBody,
  useSelection,
  useSelectionActions,
  useTileTree,
} from "./context";

type Props = {
  page: SpideyTile;
  width: number;
  height: number;
  x: number;
  y: number;
  /** Current canvas scale; used to keep the active ring visible at low zoom */
  scale: number;
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

/**
 * Rewrite asset URLs captured at dev time so they survive after the user's
 * dev server has stopped. Capture absolutizes relative paths to the
 * dev-server origin (e.g. `http://localhost:3000/images/foo.svg`); we
 * route those through the view-server's `/_spidey-static/<projectId>/...`
 * proxy, which serves directly from the project's `public/` directory.
 *
 * Special-case `/_next/image?url=ENCODED&w=…&q=…` since Next's resizer
 * can't be replayed without a live dev server — we extract the underlying
 * `url` and serve that static file.
 *
 * Returns the input unchanged when no rewrite applies (e.g. external CDN,
 * data URI, blob).
 */
function makeAssetRewriter(projectId: string | null) {
  if (!projectId) return (s: string) => s;
  const STATIC_BASE = `/_spidey-static/${encodeURIComponent(projectId)}`;
  // Match dev-server-absolute `http(s)://localhost:PORT/<rest>` and any
  // `127.0.0.1` / `0.0.0.0` variant we might capture.
  const DEV_ORIGIN = /^(https?:)?\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+(\/.*)?$/;
  return function rewrite(value: string): string {
    if (!value) return value;
    const m = value.match(DEV_ORIGIN);
    if (!m) return value;
    const path = m[2] ?? "/";
    if (path.startsWith("/_next/image")) {
      const q = path.slice("/_next/image".length);
      const params = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
      const inner = params.get("url");
      if (inner && inner.startsWith("/")) {
        return STATIC_BASE + inner;
      }
      // External (`?url=https://cdn...`) — leave alone, browser will fetch.
      if (inner) return inner;
      return value;
    }
    // `/_next/static/...` is bundled output; not in `public/`. Leave the
    // dev-origin URL so it loads while dev is up; harmless 404 otherwise.
    if (path.startsWith("/_next/")) return value;
    return STATIC_BASE + path;
  };
}

export function Tile({ page, width, height, x, y, scale }: Props) {
  const dispatch = useEditorDispatch();
  const rev = useEditorRev();
  const tool = useEditorState().tool;
  const tree = useTileTree(page.id);
  const { activeTileId, selectedNodeId, hoveredNodeId, altPressed } =
    useSelection();
  const { setActiveTileId, setSelectedNodeId, setHoveredNodeId } =
    useSelectionActions();
  const registerBody = useRegisterTileBody();
  const { activeProjectId } = useProject();

  const active = activeTileId === page.id;
  const tileSelectedNodeId = active ? selectedNodeId : null;
  const tileHoveredNodeId = active ? hoveredNodeId : null;

  const hostRef = useRef<HTMLDivElement>(null);
  const bodyWrapperRef = useRef<HTMLDivElement>(null);
  /** The synthesized <body> inside the shadow root. Set during shell-mount,
   *  registered with the TileBodies context so node-id ↔ HTMLElement
   *  lookups have a stable starting point. */
  const synthBodyRef = useRef<HTMLElement | null>(null);
  /** Last-down state — used by drag-vs-click detection. */
  const downRef = useRef<{
    x: number;
    y: number;
    t: number;
    nodeId: string | null;
  } | null>(null);
  const lastClickAt = useRef(0);
  /** Active drag-to-rearrange state. Set when the user starts dragging an
   *  element on the select tool past the click threshold. Cleared on drop. */
  const dragRef = useRef<{
    nodeId: string;
    indicator: HTMLDivElement;
    drop: { parentId: string; index: number } | null;
    /** The actual rendered element being dragged. Opacity/outline mutated
     *  for ghost effect; restored on release. */
    sourceEl: HTMLElement | null;
    /** Floating "Moving <tag>" label that follows the cursor. Lives on
     *  document.body (outside the shadow root) so it's not clipped by the
     *  tile's overflow. */
    label: HTMLDivElement | null;
  } | null>(null);

  // ----- Shell mount (page identity changed) -----
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
      body { position: relative; }
      /* Pause autoplaying animations + transitions in editor — distracting
         while designing, and burns CPU per-tile. Each ::before/::after
         is paused too so spinners/skeletons freeze at their first frame. */
      *, *::before, *::after {
        animation-play-state: paused !important;
        animation-delay: 0s !important;
        transition: none !important;
      }
      /* Default cursor everywhere; the editor decides hover semantics
         via its own select/insert tools. Prevents text-cursor + pointer-on-
         button mismatches that confuse the click target. */
      *, *::before, *::after { cursor: default !important; }
      /* Defang hover-only color/shadow transitions visually being pre-
         applied: nothing to do — transition:none above already handles it. */
      [data-spidey-id][contenteditable="true"] {
        outline: 2px solid rgba(91,140,255,0.7);
        outline-offset: 1px;
        cursor: text !important;
      }
    `;
    shadow.appendChild(reset);

    if (page.css) {
      const style = document.createElement("style");
      const rewriteAsset = makeAssetRewriter(activeProjectId);
      // `:root` doesn't match inside a shadow root — rewrite to `:host` so
      // CSS-variable declarations and theme rules continue to apply. Also
      // rewrite `url(http://localhost:3000/...)` references to the
      // view-server's static-asset proxy so background-image / mask-image
      // assets keep loading after the dev server has stopped.
      style.textContent = page.css
        .replace(/:root\b/g, ":host")
        .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (_m, q, raw) => {
          const rewritten = rewriteAsset(raw.trim());
          return `url(${q}${rewritten}${q})`;
        });
      shadow.appendChild(style);
    }

    const synthHtml = document.createElement("html");
    applyAttrs(synthHtml, page.htmlAttrs);
    const synthBody = document.createElement("body");
    applyAttrs(synthBody, page.bodyAttrs);
    synthHtml.appendChild(synthBody);
    shadow.appendChild(synthHtml);

    synthBodyRef.current = synthBody;
    registerBody(page.id, synthBody);
    // registerBody comes from a stable context callback — safe to omit
    // from deps. Including it would re-fire on every render of the
    // provider and wipe the body unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page.id,
    page.status,
    page.css,
    page.bodyAttrs,
    page.htmlAttrs,
    activeProjectId,
  ]);

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

    // Rewrite asset URLs to flow through the view-server's static proxy.
    // Without this, every <img src="http://localhost:3000/..."> 404s as
    // soon as the user's dev server stops. Done after renderNode mounts
    // the tree so we walk the actual rendered DOM (including SVG) once.
    {
      const rewriteAsset = makeAssetRewriter(activeProjectId);
      const ATTRS = ["src", "poster"] as const;
      body.querySelectorAll<HTMLElement>("[src], [poster], [srcset]").forEach(
        (el) => {
          for (const a of ATTRS) {
            const v = el.getAttribute(a);
            if (v) {
              const next = rewriteAsset(v);
              if (next !== v) el.setAttribute(a, next);
            }
          }
          const ss = el.getAttribute("srcset");
          if (ss) {
            const rewritten = ss
              .split(",")
              .map((part) => {
                const trimmed = part.trim();
                if (!trimmed) return "";
                const m = trimmed.match(/^(\S+)(\s.*)?$/);
                if (!m) return trimmed;
                return rewriteAsset(m[1]) + (m[2] ?? "");
              })
              .filter(Boolean)
              .join(", ");
            if (rewritten !== ss) el.setAttribute("srcset", rewritten);
          }
        },
      );
    }

    // Defang anchors so clicks don't navigate; forms so submits don't reload.
    body.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("data-href", a.getAttribute("href") ?? "");
      a.removeAttribute("href");
      (a as HTMLElement).style.cursor = "default";
    });
    body.querySelectorAll("form").forEach((f) => {
      f.addEventListener("submit", (e) => e.preventDefault());
    });

    // Form inputs: native typing would mutate the live DOM but never
    // persist into the SpideyNode tree, so the value snaps back on the
    // next re-render. Mark them readonly/disabled so the only edit path
    // is the inspector's ValueSection. We keep `tabindex=-1` too so
    // clicks don't trap focus inside an input the user can't actually
    // change here.
    body
      .querySelectorAll<HTMLInputElement>(
        "input:not([type=checkbox]):not([type=radio]):not([type=range])",
      )
      .forEach((i) => {
        i.setAttribute("readonly", "");
        i.tabIndex = -1;
      });
    body.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((t) => {
      t.setAttribute("readonly", "");
      t.tabIndex = -1;
    });
    body.querySelectorAll<HTMLSelectElement>("select").forEach((s) => {
      s.setAttribute("disabled", "");
      s.tabIndex = -1;
    });
    // Checkbox/radio/range: keep clickable so toggling/dragging shows
    // visual state, but reset on each re-render anyway since the change
    // doesn't persist. Block via preventDefault so the visual state
    // matches what's captured.
    body
      .querySelectorAll<HTMLInputElement>(
        "input[type=checkbox], input[type=radio]",
      )
      .forEach((i) => {
        i.addEventListener("click", (e) => e.preventDefault());
        i.tabIndex = -1;
      });
  }, [tree, page.id, activeProjectId]);

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

    // ----- Insert-tool hover highlight -----
    let insertHover: HTMLDivElement | null = null;
    const ensureInsertHover = (): HTMLDivElement | null => {
      if (!body) return null;
      if (!insertHover) {
        insertHover = document.createElement("div");
        insertHover.dataset.spideyInsertHover = "1";
        insertHover.style.cssText =
          "position:absolute; pointer-events:none; z-index:99998; box-sizing:border-box; border:2px dashed #5b8cff; background:rgba(91,140,255,0.10);";
        body.appendChild(insertHover);
      }
      return insertHover;
    };
    const clearInsertHover = () => {
      if (insertHover) {
        insertHover.remove();
        insertHover = null;
      }
    };
    const updateInsertHover = (target: HTMLElement | null) => {
      if (!body || !tree || tree.kind !== "el") return;
      let el: HTMLElement | null = target;
      while (el && !el.hasAttribute?.("data-spidey-id")) {
        el = el.parentElement;
      }
      const ind = ensureInsertHover();
      if (!ind) return;
      const focusEl =
        el ??
        (body.querySelector(
          `[data-spidey-id="${tree.id}"]`,
        ) as HTMLElement | null);
      if (!focusEl) {
        ind.style.display = "none";
        return;
      }
      const tRect = focusEl.getBoundingClientRect();
      const bRect = body.getBoundingClientRect();
      const sx = bRect.width / (body.clientWidth || 1) || 1;
      const sy = bRect.height / (body.clientHeight || 1) || 1;
      ind.style.display = "block";
      ind.style.left = `${(tRect.left - bRect.left) / sx}px`;
      ind.style.top = `${(tRect.top - bRect.top) / sy}px`;
      ind.style.width = `${tRect.width / sx}px`;
      ind.style.height = `${tRect.height / sy}px`;
    };

    const isInsertTool = tool === "rect" || tool === "text" || tool === "image";

    /** Tear down a drag — restore styles, remove indicator + label, and
     *  optionally dispatch the move. */
    const finishDrag = (dispatchDrop: boolean) => {
      const drag = dragRef.current;
      if (!drag) return;
      drag.indicator.remove();
      drag.label?.remove();
      if (drag.sourceEl) {
        drag.sourceEl.style.opacity = "";
        drag.sourceEl.style.outline = "";
        drag.sourceEl.style.outlineOffset = "";
        drag.sourceEl.style.transition = "";
      }
      if (body) body.style.cursor = "";
      dragRef.current = null;
      if (dispatchDrop && drag.drop) {
        dispatch({
          type: "moveNode",
          tileId: page.id,
          nodeId: drag.nodeId,
          newParentId: drag.drop.parentId,
          newIndex: drag.drop.index,
        });
      }
    };

    const cssEscape = (s: string) =>
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"');

    /** Resolve the SpideyNode element that should receive a newly-inserted
     *  primitive given the user's click target. */
    const parentForInsert = (
      target: HTMLElement | null,
      root: SpideyNode & { kind: "el" },
    ): SpideyNode & { kind: "el" } => {
      let el: HTMLElement | null = target;
      while (el && !el.hasAttribute?.("data-spidey-id")) {
        el = el.parentElement;
      }
      const id = el?.getAttribute("data-spidey-id");
      if (!id) return root;
      const node = findById(root, id);
      if (!node || node.kind !== "el") return root;
      return node;
    };

    const onMouseOver = (e: MouseEvent) => {
      if (!active) return;
      const path = e.composedPath()[0] as HTMLElement | null;
      if (isInsertTool) {
        updateInsertHover(path);
        return;
      }
      if (tool !== "select") return;
      const el = isInsideContent(path);
      if (!el) {
        setHoveredNodeId(null);
        return;
      }
      setHoveredNodeId(el.getAttribute("data-spidey-id"));
    };
    const onMouseOut = (e: MouseEvent) => {
      if (!active) return;
      const next = e.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      if (isInsertTool) {
        clearInsertHover();
        return;
      }
      if (tool !== "select") return;
      setHoveredNodeId(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (tool === "hand") return; // let canvas pan
      const target = e.composedPath()[0] as HTMLElement | null;
      const id = target?.getAttribute?.("data-spidey-id") ?? null;
      downRef.current = { x: e.clientX, y: e.clientY, t: Date.now(), nodeId: id };
    };
    const onMouseMove = (e: MouseEvent) => {
      const start = downRef.current;
      if (!start) return;
      if (tool !== "select" || !active || !start.nodeId || !body || !tree)
        return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!dragRef.current && dist > CLICK_DIST_PX) {
        const indicator = document.createElement("div");
        indicator.dataset.spideyDropIndicator = "1";
        indicator.style.cssText =
          "position:absolute; pointer-events:none; z-index:100000; box-sizing:border-box; transition: top 80ms ease, left 80ms ease, width 80ms ease, height 80ms ease, background-color 120ms ease;";
        body.appendChild(indicator);

        const sourceEl = body.querySelector(
          `[data-spidey-id="${cssEscape(start.nodeId)}"]`,
        ) as HTMLElement | null;
        if (sourceEl) {
          sourceEl.style.transition = "opacity 100ms ease";
          sourceEl.style.opacity = "0.4";
          sourceEl.style.outline = "2px dashed #5b8cff";
          sourceEl.style.outlineOffset = "2px";
        }

        const tagLabel =
          (sourceEl?.getAttribute("data-spidey-component") &&
            `<${sourceEl.getAttribute("data-spidey-component")}>`) ||
          (sourceEl ? `<${sourceEl.tagName.toLowerCase()}>` : "node");
        const label = document.createElement("div");
        label.textContent = `Moving ${tagLabel}`;
        label.style.cssText =
          "position:fixed; pointer-events:none; z-index:2147483647; padding:4px 8px; border-radius:6px; background:#5b8cff; color:white; font:600 11px ui-sans-serif,system-ui,sans-serif; box-shadow:0 4px 12px rgba(0,0,0,0.2); transform: translate(12px, 12px); white-space:nowrap;";
        document.body.appendChild(label);

        dragRef.current = {
          nodeId: start.nodeId,
          indicator,
          drop: null,
          sourceEl,
          label,
        };
        body.style.cursor = "grabbing";
      }

      const drag = dragRef.current;
      if (!drag) return;

      if (drag.label) {
        drag.label.style.left = `${e.clientX}px`;
        drag.label.style.top = `${e.clientY}px`;
      }

      const hit = (root as ShadowRoot).elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement | null;
      let target: HTMLElement | null = hit;
      while (target && !target.hasAttribute?.("data-spidey-id")) {
        target = target.parentElement;
      }
      const draggedNode = findById(tree, drag.nodeId);
      const targetId = target?.getAttribute("data-spidey-id") ?? null;

      const invalid =
        !target ||
        !targetId ||
        targetId === drag.nodeId ||
        (draggedNode && findById(draggedNode, targetId));

      if (invalid || !target || !targetId) {
        drag.indicator.style.display = "none";
        drag.drop = null;
        return;
      }

      const bRect = body.getBoundingClientRect();
      const sx = bRect.width / (body.clientWidth || 1) || 1;
      const sy = bRect.height / (body.clientHeight || 1) || 1;
      const px = (clientX: number) => (clientX - bRect.left) / sx;
      const py = (clientY: number) => (clientY - bRect.top) / sy;

      const childEls: HTMLElement[] = Array.from(target.children).filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement &&
          c.hasAttribute("data-spidey-id") &&
          c.getAttribute("data-spidey-id") !== drag.nodeId,
      );
      const cursorInRect = (r: DOMRect) =>
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;
      const cursorInsideAnyChild = childEls.some((c) =>
        cursorInRect(c.getBoundingClientRect()),
      );

      drag.indicator.style.background = "#5b8cff";
      drag.indicator.style.border = "none";
      drag.indicator.style.display = "block";

      if (childEls.length > 0 && !cursorInsideAnyChild) {
        const rects = childEls.map((c) => c.getBoundingClientRect());
        const horizontal = rects.some((r, i) => {
          if (i === 0) return false;
          const prev = rects[i - 1];
          return r.top < prev.bottom && r.bottom > prev.top;
        });
        let gapIndex: number;
        if (horizontal) {
          gapIndex = rects.findIndex((r) => r.left + r.width / 2 > e.clientX);
        } else {
          gapIndex = rects.findIndex((r) => r.top + r.height / 2 > e.clientY);
        }
        if (gapIndex < 0) gapIndex = childEls.length;

        const upper = childEls[gapIndex - 1];
        const lower = childEls[gapIndex];
        const tRect = target.getBoundingClientRect();
        if (horizontal) {
          let lineX: number;
          if (upper && lower) {
            const u = upper.getBoundingClientRect();
            const l = lower.getBoundingClientRect();
            lineX = (u.right + l.left) / 2;
          } else if (lower) {
            lineX = lower.getBoundingClientRect().left;
          } else if (upper) {
            lineX = upper.getBoundingClientRect().right;
          } else {
            lineX = tRect.left;
          }
          drag.indicator.style.left = `${px(lineX) - 1}px`;
          drag.indicator.style.top = `${py(tRect.top)}px`;
          drag.indicator.style.width = "2px";
          drag.indicator.style.height = `${tRect.height / sy}px`;
        } else {
          let lineY: number;
          if (upper && lower) {
            const u = upper.getBoundingClientRect();
            const l = lower.getBoundingClientRect();
            lineY = (u.bottom + l.top) / 2;
          } else if (lower) {
            lineY = lower.getBoundingClientRect().top;
          } else if (upper) {
            lineY = upper.getBoundingClientRect().bottom;
          } else {
            lineY = tRect.top;
          }
          drag.indicator.style.left = `${px(tRect.left)}px`;
          drag.indicator.style.top = `${py(lineY) - 1}px`;
          drag.indicator.style.width = `${tRect.width / sx}px`;
          drag.indicator.style.height = "2px";
        }

        const targetNode = findById(tree, targetId);
        if (targetNode && targetNode.kind === "el") {
          const orig = targetNode.children;
          let absIdx = 0;
          let visited = 0;
          for (; absIdx < orig.length; absIdx++) {
            if (visited === gapIndex) break;
            if (orig[absIdx].id !== drag.nodeId) visited++;
          }
          drag.drop = { parentId: targetId, index: absIdx };
        } else {
          drag.drop = null;
        }
        return;
      }

      const tRect = target.getBoundingClientRect();
      const yLocal = (e.clientY - tRect.top) / tRect.height;
      let mode: "above" | "below" | "child";
      if (yLocal < 0.25) mode = "above";
      else if (yLocal > 0.75) mode = "below";
      else mode = "child";

      const parentInfo = findParent(tree, targetId);
      if (!parentInfo && (mode === "above" || mode === "below"))
        mode = "child";

      const left = px(tRect.left);
      const top = py(tRect.top);
      const width = tRect.width / sx;
      const height = tRect.height / sy;
      if (mode === "child") {
        drag.indicator.style.left = `${left}px`;
        drag.indicator.style.top = `${top}px`;
        drag.indicator.style.width = `${width}px`;
        drag.indicator.style.height = `${height}px`;
        drag.indicator.style.background = "rgba(91,140,255,0.18)";
        drag.indicator.style.border = "2px solid #5b8cff";
        drag.drop = { parentId: targetId, index: Number.MAX_SAFE_INTEGER };
      } else {
        const lineTop = mode === "above" ? top - 1 : top + height - 1;
        drag.indicator.style.left = `${left}px`;
        drag.indicator.style.top = `${lineTop}px`;
        drag.indicator.style.width = `${width}px`;
        drag.indicator.style.height = "2px";
        if (parentInfo) {
          const idx =
            mode === "above" ? parentInfo.index : parentInfo.index + 1;
          drag.drop = { parentId: parentInfo.parent.id, index: idx };
        } else {
          drag.drop = null;
        }
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

      if (!active) {
        if (wasClick) setActiveTileId(page.id);
        if (dragRef.current) {
          finishDrag(/* dispatchDrop */ false);
        }
        return;
      }

      if (dragRef.current) {
        finishDrag(/* dispatchDrop */ true);
        return;
      }

      const target = e.composedPath()[0] as HTMLElement | null;

      if (
        wasClick &&
        (tool === "rect" || tool === "text" || tool === "image") &&
        tree &&
        tree.kind === "el"
      ) {
        const parent = parentForInsert(target, tree);
        let node: SpideyNode;
        if (tool === "rect") node = makeBoxNode();
        else if (tool === "text") node = makeTextNode("Text");
        else node = makeImageNode();
        dispatch({
          type: "insertNode",
          tileId: page.id,
          parentId: parent.id,
          index: parent.children.length,
          node,
        });
        setSelectedNodeId(node.id);
        clearInsertHover();
        return;
      }

      if (tool === "select" && wasClick) {
        const el = isInsideContent(target);
        const id = el?.getAttribute("data-spidey-id") ?? null;

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

        setSelectedNodeId(id);
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
      clearInsertHover();
      if (dragRef.current) finishDrag(false);
    };
  }, [
    active,
    tool,
    tree,
    page.id,
    page.kind,
    setActiveTileId,
    setSelectedNodeId,
    setHoveredNodeId,
    dispatch,
  ]);

  const isErr = page.status === "error";

  // Ring width is in canvas-local pixels; the canvas is then CSS-scaled.
  // Compensate so the ring always reads ~2 viewport px regardless of zoom.
  const ringPx = Math.max(1, 2 / Math.max(scale, 0.05));

  // Floating Figma-style label above the tile. Font size scales inversely
  // with zoom so the label reads at ~10px on-screen regardless of canvas
  // scale.
  const labelFontPx = Math.max(7, 10 / Math.max(scale, 0.05));
  const labelGapPx = labelFontPx * 0.6;

  const labelText =
    page.kind === "component"
      ? `<${page.component?.name ?? "Component"}>`
      : page.route ?? "";

  return (
    <div
      className="tile absolute"
      style={{ left: x, top: y, width, height }}
    >
      <button
        type="button"
        onClick={() => setActiveTileId(page.id)}
        className={[
          "absolute left-0 font-mono whitespace-nowrap bg-transparent border-0 p-0 m-0 cursor-default flex items-center gap-1.5 hover:opacity-80 transition-opacity",
          active ? "text-primary" : "text-muted-foreground",
          isErr ? "text-destructive" : "",
        ].join(" ")}
        // Deliberately NOT constraining maxWidth to the tile width —
        // Figma-style frame labels overflow the frame so component names
        // like "AlertIcon" stay readable on a 48-px icon tile. The
        // label's stacking is fine because tiles are spaced apart on the
        // canvas; touching is rare.
        style={{
          bottom: "100%",
          paddingBottom: labelGapPx,
          fontSize: labelFontPx,
          lineHeight: 1.2,
        }}
      >
        <span>{labelText}</span>
        {isErr && (
          <span
            className="bg-destructive/20 text-destructive uppercase tracking-[0.5px] rounded-xs px-1 py-px"
            style={{ fontSize: Math.max(7, labelFontPx * 0.75) }}
          >
            error
          </span>
        )}
      </button>
      <div
        className={[
          "rounded-md overflow-hidden border transition-shadow transition-colors duration-150",
          isErr ? "bg-[#2c1f1f]" : "bg-white",
          active ? "border-primary" : "border-border",
        ].join(" ")}
        style={{
          width,
          height,
          boxShadow: active
            ? `0 4px 24px rgba(0,0,0,0.4), 0 0 0 ${ringPx}px rgba(91,140,255,0.45)`
            : "0 4px 24px rgba(0,0,0,0.4)",
        }}
      >
      <div
        ref={bodyWrapperRef}
        className="relative bg-white overflow-hidden"
        style={{ width, height }}
      >
        {isErr ? (
          <div className="p-4 font-mono text-[11px] text-destructive bg-[#2c1f1f] whitespace-pre-wrap break-words">
            {page.error ?? "capture failed"}
          </div>
        ) : (
          <>
            <div ref={hostRef} className="block w-full h-full" />
            {active && (
              <SelectionOverlay
                tileBody={bodyWrapperRef.current}
                synthBody={synthBodyRef.current}
                selectedNodeId={tileSelectedNodeId}
                hoveredNodeId={tileHoveredNodeId}
                altPressed={altPressed}
                rev={rev}
                tool={tool}
                tileId={page.id}
                tree={tree}
              />
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

// --------- helpers ---------

function makeBoxNode(): SpideyNode {
  return {
    id: newId(),
    kind: "el",
    tag: "div",
    attrs: { "data-spidey-primitive": "box" },
    style: {
      width: "100px",
      height: "100px",
      background: "#ef4444",
    },
    children: [],
  };
}

function makeTextNode(value: string): SpideyNode {
  return {
    id: newId(),
    kind: "el",
    tag: "p",
    attrs: { "data-spidey-primitive": "text" },
    style: { margin: "0" },
    children: [{ id: newId(), kind: "text", value }],
  };
}

function makeImageNode(): SpideyNode {
  const w = 200;
  const h = 140;
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
      width: `${w}px`,
      height: `${h}px`,
    },
    children: [],
  };
}

function maybeStartTextEdit(
  nodeId: string,
  target: HTMLElement,
  tree: SpideyNode,
  tileId: string,
  dispatch: (action: import("./editor/state").EditAction) => void,
): void {
  const node = findById(tree, nodeId);
  if (!node || node.kind !== "el") return;

  const textChildren = node.children.filter((c) => c.kind === "text");
  if (textChildren.length === 0 || textChildren.length !== node.children.length) {
    return;
  }
  const textNode = textChildren[0];

  target.setAttribute("contenteditable", "true");
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
