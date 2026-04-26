import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SpideyNode } from "@spidey/shared";
import { measureDistance, type Rect } from "./inspect/distance";
import { findElementById } from "./editor/render";
import { findById } from "./editor/tree";
import type { EditAction, Tool } from "./editor/state";

type Props = {
  /** The wrapper <div> the host renders into. Used as the geometric origin
   *  for overlay coordinates (overlays render in tile-local space). */
  tileBody: HTMLElement | null;
  /** The synthesized <body> inside the shadow root — lookup root for nodes. */
  synthBody: HTMLElement | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  altPressed: boolean;
  rev: number;
  tool: Tool;
  tileId: string;
  tree: SpideyNode | null;
  dispatch: (action: EditAction) => void;
};

type DragMode =
  | { kind: "move"; startX: number; startY: number; origLeft: number; origTop: number }
  | {
      kind: "resize";
      handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
      startX: number;
      startY: number;
      origLeft: number;
      origTop: number;
      origWidth: number;
      origHeight: number;
    };

export function SelectionOverlay({
  tileBody,
  synthBody,
  selectedNodeId,
  hoveredNodeId,
  altPressed,
  rev,
  tool,
  tileId,
  tree,
  dispatch,
}: Props) {
  const [selRect, setSelRect] = useState<Rect | null>(null);
  const [hovRect, setHovRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragMode | null>(null);
  /** Set during a drag so we don't dispatch dozens of setStyle actions per
   *  frame — we mutate the live element directly, then commit on release. */
  const liveTargetRef = useRef<HTMLElement | null>(null);

  const selectedEl = synthBody && selectedNodeId
    ? findElementById(synthBody, selectedNodeId)
    : null;
  const hoveredEl = synthBody && hoveredNodeId
    ? findElementById(synthBody, hoveredNodeId)
    : null;

  useLayoutEffect(() => {
    if (!tileBody) {
      setSelRect(null);
      setHovRect(null);
      return;
    }
    const body = tileBody.getBoundingClientRect();
    const naturalW = tileBody.clientWidth || tileBody.offsetWidth || 1;
    const scale = body.width / naturalW || 1;

    const computeRect = (el: HTMLElement | null): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - body.left) / scale,
        y: (r.top - body.top) / scale,
        width: r.width / scale,
        height: r.height / scale,
      };
    };

    setSelRect(computeRect(selectedEl));
    setHovRect(computeRect(hoveredEl));
  }, [tileBody, selectedEl, hoveredEl, rev, dragging]);

  // Drag (move/resize) lives on window so cursor can leave the tile bounds.
  useEffect(() => {
    if (!dragging) return;
    const target = liveTargetRef.current;
    if (!target || !tileBody) return;
    const bodyRect = tileBody.getBoundingClientRect();
    const scale = bodyRect.width / (tileBody.clientWidth || 1);

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / scale;
      const dy = (e.clientY - drag.startY) / scale;
      if (drag.kind === "move") {
        target.style.left = `${Math.round(drag.origLeft + dx)}px`;
        target.style.top = `${Math.round(drag.origTop + dy)}px`;
      } else {
        let { origLeft, origTop, origWidth, origHeight } = drag;
        let newLeft = origLeft;
        let newTop = origTop;
        let newW = origWidth;
        let newH = origHeight;
        const h = drag.handle;
        if (h.includes("e")) newW = Math.max(8, origWidth + dx);
        if (h.includes("s")) newH = Math.max(8, origHeight + dy);
        if (h.includes("w")) {
          newW = Math.max(8, origWidth - dx);
          newLeft = origLeft + dx;
        }
        if (h.includes("n")) {
          newH = Math.max(8, origHeight - dy);
          newTop = origTop + dy;
        }
        target.style.left = `${Math.round(newLeft)}px`;
        target.style.top = `${Math.round(newTop)}px`;
        target.style.width = `${Math.round(newW)}px`;
        target.style.height = `${Math.round(newH)}px`;
      }
      // Force overlay rect recompute on next layout.
      setSelRect((prev) => (prev ? { ...prev } : prev));
    };
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      const t = liveTargetRef.current;
      liveTargetRef.current = null;
      setDragging(false);
      if (!t || !drag || !selectedNodeId) return;
      // commit final style values to the tree
      const props: Array<[string, string]> = [];
      props.push(["left", t.style.left || ""]);
      props.push(["top", t.style.top || ""]);
      if (drag.kind === "resize") {
        props.push(["width", t.style.width || ""]);
        props.push(["height", t.style.height || ""]);
      }
      for (const [prop, value] of props) {
        if (!value) continue;
        dispatch({
          type: "setStyle",
          tileId,
          nodeId: selectedNodeId,
          prop,
          value,
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, tileBody, selectedNodeId, tileId, dispatch]);

  if (!tileBody) return null;

  const measurements =
    altPressed && selRect && hovRect && selectedEl !== hoveredEl
      ? measureDistance(selRect, hovRect)
      : [];

  const showHover = hovRect && hoveredEl !== selectedEl;

  // Move/resize handles only when:
  // - in select mode
  // - the selected node carries position:absolute (otherwise dragging
  //   conflicts with normal-flow layout)
  const selectedNode = selectedNodeId && tree
    ? findById(tree, selectedNodeId)
    : null;
  const isPositioned =
    selectedNode?.kind === "el" &&
    selectedNode.style?.position === "absolute";
  const showHandles = tool === "select" && isPositioned && !!selRect;

  const startMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedEl || !selectedNode || selectedNode.kind !== "el") return;
    const left = parseFloat(selectedEl.style.left) || 0;
    const top = parseFloat(selectedEl.style.top) || 0;
    dragRef.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      origLeft: left,
      origTop: top,
    };
    liveTargetRef.current = selectedEl;
    setDragging(true);
  };

  const startResize = (
    handle: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
  ) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!selectedEl || !selectedNode || selectedNode.kind !== "el") return;
    const r = selectedEl.getBoundingClientRect();
    const tileR = tileBody.getBoundingClientRect();
    const naturalW = tileBody.clientWidth || 1;
    const scale = tileR.width / naturalW || 1;
    const left = parseFloat(selectedEl.style.left) || 0;
    const top = parseFloat(selectedEl.style.top) || 0;
    const width = r.width / scale;
    const height = r.height / scale;
    dragRef.current = {
      kind: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: left,
      origTop: top,
      origWidth: width,
      origHeight: height,
    };
    liveTargetRef.current = selectedEl;
    setDragging(true);
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {showHover && (
        <div
          className="absolute pointer-events-none border border-dashed border-accent bg-accent/5"
          style={{
            left: hovRect.x,
            top: hovRect.y,
            width: hovRect.width,
            height: hovRect.height,
          }}
        />
      )}
      {selRect && (
        <>
          <div
            className={[
              "absolute border-[1.5px] border-accent",
              showHandles ? "pointer-events-auto cursor-move" : "pointer-events-none",
            ].join(" ")}
            style={{
              left: selRect.x,
              top: selRect.y,
              width: selRect.width,
              height: selRect.height,
            }}
            onMouseDown={showHandles ? startMove : undefined}
          >
            {showHandles && (
              <>
                <Handle pos="-top-1 -left-1 cursor-nwse-resize" onMouseDown={startResize("nw")} />
                <Handle pos="-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize" onMouseDown={startResize("n")} />
                <Handle pos="-top-1 -right-1 cursor-nesw-resize" onMouseDown={startResize("ne")} />
                <Handle pos="top-1/2 -left-1 -translate-y-1/2 cursor-ew-resize" onMouseDown={startResize("w")} />
                <Handle pos="top-1/2 -right-1 -translate-y-1/2 cursor-ew-resize" onMouseDown={startResize("e")} />
                <Handle pos="-bottom-1 -left-1 cursor-nesw-resize" onMouseDown={startResize("sw")} />
                <Handle pos="-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize" onMouseDown={startResize("s")} />
                <Handle pos="-bottom-1 -right-1 cursor-nwse-resize" onMouseDown={startResize("se")} />
              </>
            )}
            {!showHandles && (
              <>
                <Handle pos="-top-1 -left-1" />
                <Handle pos="-top-1 -right-1" />
                <Handle pos="-bottom-1 -left-1" />
                <Handle pos="-bottom-1 -right-1" />
              </>
            )}
          </div>
          <div
            className="absolute pointer-events-none bg-accent text-white px-1.5 py-0.5 text-[11px] font-mono rounded-sm whitespace-nowrap"
            style={{
              left: selRect.x,
              top: selRect.y + selRect.height + 6,
            }}
          >
            {Math.round(selRect.width)} × {Math.round(selRect.height)}
          </div>
        </>
      )}
      {measurements.map((m, i) => (
        <Measurement key={i} m={m} />
      ))}
    </div>
  );
}

function Handle({
  pos,
  onMouseDown,
}: {
  pos: string;
  onMouseDown?: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      onMouseDown={onMouseDown}
      className={[
        "absolute w-1.5 h-1.5 bg-white border-[1.5px] border-accent rounded-[1px]",
        onMouseDown ? "pointer-events-auto" : "",
        pos,
      ].join(" ")}
    />
  );
}

function Measurement({
  m,
}: {
  m: ReturnType<typeof measureDistance>[number];
}) {
  const horizontal = m.direction === "left" || m.direction === "right";
  const length = Math.max(
    Math.abs(m.line.x2 - m.line.x1),
    Math.abs(m.line.y2 - m.line.y1),
  );
  return (
    <>
      <div
        className="absolute bg-warn pointer-events-none"
        style={
          horizontal
            ? {
                left: Math.min(m.line.x1, m.line.x2),
                top: m.line.y1 - 0.5,
                width: length,
                height: 1,
              }
            : {
                left: m.line.x1 - 0.5,
                top: Math.min(m.line.y1, m.line.y2),
                width: 1,
                height: length,
              }
        }
      />
      <div
        className="absolute bg-warn text-white text-[11px] font-mono px-1.5 py-px rounded-sm whitespace-nowrap pointer-events-none"
        style={{
          left: m.label.x,
          top: m.label.y,
          transform: "translate(-50%, -50%)",
        }}
      >
        {Math.round(m.distance)}
      </div>
    </>
  );
}
