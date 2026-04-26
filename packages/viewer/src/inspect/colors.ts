export type ParsedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
  /** Original input, normalized via the browser */
  display: string;
};

const probe =
  typeof document !== "undefined" ? document.createElement("div") : null;

/**
 * Parse a CSS color string by deferring to the browser. Returns null when the
 * value is not a color (e.g. "none", "transparent" with rgba(0,0,0,0) — which
 * we treat as transparent but not "no color").
 */
export function tryParseColor(input: string | null | undefined): ParsedColor | null {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;
  if (value === "none" || value === "currentcolor" || value === "inherit")
    return null;

  if (!probe) return null;
  probe.style.color = "";
  probe.style.color = value;
  if (!probe.style.color) return null;

  // Force the browser to resolve to rgb()/rgba()
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const parsed = parseRgb(computed);
  if (!parsed) return null;
  return { ...parsed, display: value };
}

function parseRgb(s: string): { r: number; g: number; b: number; a: number } | null {
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(/[ ,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const r = clamp(Number(parts[0]), 0, 255);
  const g = clamp(Number(parts[1]), 0, 255);
  const b = clamp(Number(parts[2]), 0, 255);
  const a = parts[3] != null ? clamp(Number(parts[3]), 0, 1) : 1;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
  return { r, g, b, a };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
