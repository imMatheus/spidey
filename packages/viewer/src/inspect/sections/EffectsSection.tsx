import type { SpideyNode } from "@spidey/shared";
import {
  ColorInput,
  FieldRow,
  NumberInput,
  Section,
  ToggleButton,
} from "../inputs";
import { Box } from "lucide-react";

type Shadow = {
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
  inset: boolean;
};

const EMPTY: Shadow = {
  x: "",
  y: "",
  blur: "",
  spread: "",
  color: "",
  inset: false,
};

/**
 * Parse the first comma-separated shadow from a `box-shadow` string. Real CSS
 * supports a list — v1 surfaces only the first; multi-shadow editing is a v2
 * polish task.
 */
function parseShadow(value: string): Shadow {
  if (!value || value === "none") return EMPTY;
  const first = value.split(/,(?![^()]*\))/)[0].trim();
  const inset = /\binset\b/.test(first);
  const cleaned = first.replace(/\binset\b/, "").trim();
  // Pull the trailing color (rgb()/rgba()/#hex/named).
  const colorMatch = cleaned.match(/(rgba?\([^)]+\)|#[\da-f]{3,8}|[a-z]+)$/i);
  const color = colorMatch ? colorMatch[0] : "";
  const lengths = (color ? cleaned.slice(0, -color.length).trim() : cleaned)
    .split(/\s+/)
    .filter(Boolean);
  return {
    x: lengths[0] ?? "",
    y: lengths[1] ?? "",
    blur: lengths[2] ?? "",
    spread: lengths[3] ?? "",
    color,
    inset,
  };
}

function composeShadow(s: Shadow): string {
  const parts: string[] = [];
  if (s.inset) parts.push("inset");
  parts.push(s.x || "0", s.y || "0");
  if (s.blur || s.spread) parts.push(s.blur || "0");
  if (s.spread) parts.push(s.spread);
  if (s.color) parts.push(s.color);
  return parts.join(" ");
}

/** Parse `filter: blur(Npx) ...` and return the blur value, or "". */
function parseBlur(value: string): string {
  if (!value || value === "none") return "";
  const m = value.match(/blur\(\s*([^)]+)\s*\)/);
  return m ? m[1].trim() : "";
}

function composeBlur(amount: string, existing: string): string | null {
  const trimmed = amount.trim();
  // Strip any existing blur(...) and append a new one.
  const others = (existing || "")
    .split(/\s+/)
    .filter((p) => p && !p.startsWith("blur("));
  if (!trimmed) return others.length > 0 ? others.join(" ") : null;
  others.push(`blur(${trimmed})`);
  return others.join(" ");
}

export function EffectsSection({
  node,
  computed,
  setStyle,
}: {
  node: SpideyNode & { kind: "el" };
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const inline = node.style;
  const computedShadow = computed?.getPropertyValue("box-shadow") || "";
  const inlineShadow = inline["box-shadow"] ?? "";
  const shadow = parseShadow(inlineShadow || computedShadow);

  const updateShadow = (patch: Partial<Shadow>) => {
    const next = { ...shadow, ...patch };
    const composed = composeShadow(next);
    setStyle("box-shadow", composed === "0 0" ? null : composed);
  };

  const inlineFilter = inline.filter ?? "";
  const blur = parseBlur(inlineFilter || computed?.getPropertyValue("filter") || "");

  return (
    <Section title="Effects">
      <FieldRow label="Opacity">
        <NumberInput
          value={inline.opacity ?? ""}
          computed={computed?.getPropertyValue("opacity") || ""}
          onChange={(next) => setStyle("opacity", next || null)}
          unit=""
        />
      </FieldRow>
      <FieldRow label="Shadow X">
        <NumberInput
          value={shadow.x}
          onChange={(next) => updateShadow({ x: next })}
        />
      </FieldRow>
      <FieldRow label="Shadow Y">
        <NumberInput
          value={shadow.y}
          onChange={(next) => updateShadow({ y: next })}
        />
      </FieldRow>
      <FieldRow label="Shadow blur">
        <NumberInput
          value={shadow.blur}
          onChange={(next) => updateShadow({ blur: next })}
        />
      </FieldRow>
      <FieldRow label="Shadow spread">
        <NumberInput
          value={shadow.spread}
          onChange={(next) => updateShadow({ spread: next })}
        />
      </FieldRow>
      <FieldRow label="Shadow color">
        <ColorInput
          value={shadow.color}
          onChange={(next) => updateShadow({ color: next })}
        />
      </FieldRow>
      <FieldRow label="Inset">
        <ToggleButton
          pressed={shadow.inset}
          onChange={(on) => updateShadow({ inset: on })}
          label="inset"
          icon={<Box size={12} />}
        />
      </FieldRow>
      <FieldRow label="Blur">
        <NumberInput
          value={blur}
          onChange={(next) =>
            setStyle("filter", composeBlur(next, inlineFilter))
          }
        />
      </FieldRow>
    </Section>
  );
}
