import { useLayoutEffect, useState } from "react";
import { measureDistance, type Rect } from "./inspect/distance";

type Props = {
  tileBody: HTMLElement | null;
  selected: HTMLElement | null;
  hovered: HTMLElement | null;
  altPressed: boolean;
  recomputeKey: number;
};

export function SelectionOverlay({
  tileBody,
  selected,
  hovered,
  altPressed,
  recomputeKey,
}: Props) {
  const [selRect, setSelRect] = useState<Rect | null>(null);
  const [hovRect, setHovRect] = useState<Rect | null>(null);

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

    setSelRect(computeRect(selected));
    setHovRect(computeRect(hovered));
  }, [tileBody, selected, hovered, recomputeKey]);

  if (!tileBody) return null;

  const measurements =
    altPressed && selRect && hovRect && selected !== hovered
      ? measureDistance(selRect, hovRect)
      : [];

  const showHover = hovRect && hovered !== selected;

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
            className="absolute pointer-events-none border-[1.5px] border-accent"
            style={{
              left: selRect.x,
              top: selRect.y,
              width: selRect.width,
              height: selRect.height,
            }}
          >
            <Handle pos="-top-1 -left-1" />
            <Handle pos="-top-1 -right-1" />
            <Handle pos="-bottom-1 -left-1" />
            <Handle pos="-bottom-1 -right-1" />
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

function Handle({ pos }: { pos: string }) {
  return (
    <span
      className={`absolute ${pos} w-1.5 h-1.5 bg-white border-[1.5px] border-accent rounded-[1px]`}
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
