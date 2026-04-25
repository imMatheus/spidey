export type Rect = { x: number; y: number; width: number; height: number };

export type Measurement = {
  /** Direction of the gap measured */
  direction: "top" | "right" | "bottom" | "left";
  /** Pixel distance (always positive) */
  distance: number;
  /** Line endpoints, in the same coord space as the input rects */
  line: { x1: number; y1: number; x2: number; y2: number };
  /** Where to anchor the label badge */
  label: { x: number; y: number };
};

/**
 * Figma-style distance measurement between a selected rect and a hovered one.
 * Returns up to 4 measurements — gaps in the cardinal directions where the two
 * rects don't overlap on that axis.
 */
export function measureDistance(sel: Rect, hov: Rect): Measurement[] {
  const out: Measurement[] = [];

  const selLeft = sel.x;
  const selRight = sel.x + sel.width;
  const selTop = sel.y;
  const selBottom = sel.y + sel.height;

  const hovLeft = hov.x;
  const hovRight = hov.x + hov.width;
  const hovTop = hov.y;
  const hovBottom = hov.y + hov.height;

  const xCenter = sel.x + sel.width / 2;
  const yCenter = sel.y + sel.height / 2;

  // Vertical gap above selected
  if (hovBottom < selTop) {
    const x = clamp(xCenter, Math.max(selLeft, hovLeft), Math.min(selRight, hovRight));
    const xx = Number.isFinite(x) ? x : xCenter;
    out.push({
      direction: "top",
      distance: selTop - hovBottom,
      line: { x1: xx, y1: hovBottom, x2: xx, y2: selTop },
      label: { x: xx, y: (hovBottom + selTop) / 2 },
    });
  }
  // Vertical gap below selected
  if (hovTop > selBottom) {
    const x = clamp(xCenter, Math.max(selLeft, hovLeft), Math.min(selRight, hovRight));
    const xx = Number.isFinite(x) ? x : xCenter;
    out.push({
      direction: "bottom",
      distance: hovTop - selBottom,
      line: { x1: xx, y1: selBottom, x2: xx, y2: hovTop },
      label: { x: xx, y: (selBottom + hovTop) / 2 },
    });
  }
  // Horizontal gap left of selected
  if (hovRight < selLeft) {
    const y = clamp(yCenter, Math.max(selTop, hovTop), Math.min(selBottom, hovBottom));
    const yy = Number.isFinite(y) ? y : yCenter;
    out.push({
      direction: "left",
      distance: selLeft - hovRight,
      line: { x1: hovRight, y1: yy, x2: selLeft, y2: yy },
      label: { x: (hovRight + selLeft) / 2, y: yy },
    });
  }
  // Horizontal gap right of selected
  if (hovLeft > selRight) {
    const y = clamp(yCenter, Math.max(selTop, hovTop), Math.min(selBottom, hovBottom));
    const yy = Number.isFinite(y) ? y : yCenter;
    out.push({
      direction: "right",
      distance: hovLeft - selRight,
      line: { x1: selRight, y1: yy, x2: hovLeft, y2: yy },
      label: { x: (selRight + hovLeft) / 2, y: yy },
    });
  }

  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  if (lo > hi) return n; // ranges don't overlap on this axis
  return Math.max(lo, Math.min(hi, n));
}
