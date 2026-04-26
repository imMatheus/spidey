import { tryParseColor, type ParsedColor } from "./colors";

export type StyleProp = {
  label: string;
  value: string;
  /** Set when the value is a color we can render as a chip */
  color?: ParsedColor;
};

export type StyleSection = {
  title: string;
  props: StyleProp[];
};

export type ElementSummary = {
  tag: string;
  domId?: string;
  classes: string[];
  textPreview?: string;
  rect: { x: number; y: number; width: number; height: number };
};

export function summarizeElement(
  el: HTMLElement,
  tileBody: HTMLElement | null,
  scale: number,
): ElementSummary {
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  const preview = text.length > 80 ? text.slice(0, 77) + "…" : text;
  const elRect = el.getBoundingClientRect();
  const bodyRect = tileBody?.getBoundingClientRect();
  const x = bodyRect ? (elRect.left - bodyRect.left) / scale : 0;
  const y = bodyRect ? (elRect.top - bodyRect.top) / scale : 0;
  const width = elRect.width / scale;
  const height = elRect.height / scale;
  return {
    tag: el.tagName.toLowerCase(),
    domId: el.id || undefined,
    classes: Array.from(el.classList),
    textPreview: preview || undefined,
    rect: { x, y, width, height },
  };
}

export function buildStyleSections(
  el: HTMLElement,
  rect: { width: number; height: number; x: number; y: number },
): StyleSection[] {
  const cs = getComputedStyle(el);
  const sections: StyleSection[] = [];

  // Layout — "offset" is from the tile's top-left, not viewport / document.
  const layout: StyleProp[] = [
    { label: "size", value: `${round(rect.width)} × ${round(rect.height)}` },
    { label: "offset", value: `${round(rect.x)}, ${round(rect.y)}` },
    { label: "display", value: cs.display },
  ];
  if (cs.display.includes("flex")) {
    layout.push(
      { label: "flex-dir", value: cs.flexDirection },
      { label: "justify", value: cs.justifyContent },
      { label: "align", value: cs.alignItems },
      { label: "gap", value: cs.gap },
    );
  }
  if (cs.display.includes("grid")) {
    layout.push(
      { label: "grid-cols", value: cs.gridTemplateColumns },
      { label: "grid-rows", value: cs.gridTemplateRows },
      { label: "gap", value: cs.gap },
    );
  }
  if (cs.position && cs.position !== "static") {
    layout.push({ label: "position", value: cs.position });
  }
  sections.push({ title: "Layout", props: filterTrivial(layout) });

  // Spacing — always include (rendered as a box-model diagram by the inspector)
  sections.push({
    title: "Spacing",
    props: [
      { label: "padding", value: shortBox(cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft) },
      { label: "margin", value: shortBox(cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft) },
    ],
  });

  // Typography (only meaningful when there's text or it's a text-leaf-ish element)
  const typography: StyleProp[] = [
    { label: "font", value: cs.fontFamily },
    { label: "size", value: cs.fontSize },
    { label: "weight", value: cs.fontWeight },
    { label: "line-height", value: cs.lineHeight },
    colorProp("color", cs.color),
    { label: "text-align", value: cs.textAlign },
    { label: "letter-spacing", value: cs.letterSpacing },
  ];
  sections.push({ title: "Typography", props: filterTrivial(typography) });

  // Fill / Background
  const fill: StyleProp[] = [
    colorProp("background", cs.backgroundColor),
  ];
  if (cs.backgroundImage && cs.backgroundImage !== "none") {
    fill.push({ label: "image", value: cs.backgroundImage });
  }
  sections.push({ title: "Fill", props: filterTrivial(fill) });

  // Border
  const border: StyleProp[] = [];
  const bw = cs.borderTopWidth;
  if (bw && bw !== "0px") {
    border.push({ label: "width", value: shortBox(cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth) });
    border.push({ label: "style", value: cs.borderTopStyle });
    border.push(colorProp("color", cs.borderTopColor));
  }
  if (cs.borderRadius && cs.borderRadius !== "0px") {
    border.push({ label: "radius", value: cs.borderRadius });
  }
  sections.push({ title: "Border", props: filterTrivial(border) });

  // Effects
  const effects: StyleProp[] = [];
  if (cs.boxShadow && cs.boxShadow !== "none") effects.push({ label: "shadow", value: cs.boxShadow });
  if (cs.opacity && cs.opacity !== "1") effects.push({ label: "opacity", value: cs.opacity });
  if (cs.filter && cs.filter !== "none") effects.push({ label: "filter", value: cs.filter });
  if (cs.transform && cs.transform !== "none") effects.push({ label: "transform", value: cs.transform });
  sections.push({ title: "Effects", props: effects });

  return sections.filter((s) => s.props.length > 0);
}

function colorProp(label: string, value: string): StyleProp {
  const c = tryParseColor(value);
  if (c && c.a > 0) return { label, value: shortColor(c, value), color: c };
  return { label, value };
}

function shortColor(c: ParsedColor, raw: string): string {
  // Prefer hex when reasonably representable
  if (raw.startsWith("#")) return raw.toUpperCase();
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  if (c.a >= 1) return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase();
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${round(c.a, 2)})`;
}

function shortBox(t: string, r: string, b: string, l: string): string {
  const px = (s: string) => s.replace("px", "");
  const tt = px(t), rr = px(r), bb = px(b), ll = px(l);
  if (tt === rr && rr === bb && bb === ll) return `${tt}px`;
  if (tt === bb && rr === ll) return `${tt}px ${rr}px`;
  return `${tt}px ${rr}px ${bb}px ${ll}px`;
}

function filterTrivial(props: StyleProp[]): StyleProp[] {
  return props.filter((p) => {
    const v = p.value?.toString().trim();
    if (!v) return false;
    if (v === "normal" && /letter|line/.test(p.label)) return false;
    if (v === "auto") return false;
    if (v === "0px" && /size|spacing|width/.test(p.label)) return false;
    return true;
  });
}

function round(n: number, digits = 0): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
