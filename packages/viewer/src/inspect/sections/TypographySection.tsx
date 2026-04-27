import type { SpideyNode } from "@spidey/shared";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  ColorInput,
  FieldRow,
  NumberInput,
  Section,
  SegmentedInput,
  SelectInput,
  ToggleButton,
} from "../inputs";

const ALIGN_OPTIONS = [
  { value: "left", icon: <AlignLeft size={12} />, label: "left" },
  { value: "center", icon: <AlignCenter size={12} />, label: "center" },
  { value: "right", icon: <AlignRight size={12} />, label: "right" },
  { value: "justify", icon: <AlignJustify size={12} />, label: "justify" },
];

const TRANSFORM_OPTIONS = [
  { value: "none", label: "none" },
  { value: "uppercase", label: "uppercase" },
  { value: "lowercase", label: "lowercase" },
  { value: "capitalize", label: "capitalize" },
];

const WEIGHT_OPTIONS = [
  { value: "100", label: "100 thin" },
  { value: "200", label: "200 extra-light" },
  { value: "300", label: "300 light" },
  { value: "400", label: "400 regular" },
  { value: "500", label: "500 medium" },
  { value: "600", label: "600 semibold" },
  { value: "700", label: "700 bold" },
  { value: "800", label: "800 extra-bold" },
  { value: "900", label: "900 black" },
];

export function TypographySection({
  node,
  computed,
  setStyle,
}: {
  node: SpideyNode & { kind: "el" };
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const inline = node.style;
  const decoration = inline["text-decoration"] ?? inline["text-decoration-line"] ?? "";
  const isUnderline = /underline/.test(decoration);
  const isStrike = /line-through/.test(decoration);
  const isItalic = (inline["font-style"] || "") === "italic";

  const setDecoration = (kind: "underline" | "line-through", on: boolean) => {
    const others = (decoration || "")
      .split(/\s+/)
      .filter((d) => d && d !== kind);
    const next = on ? [...others, kind].join(" ") : others.join(" ");
    setStyle("text-decoration", next || null);
  };

  return (
    <Section title="Typography">
      <FieldRow label="family">
        <NumberInput
          value={inline["font-family"] ?? ""}
          computed={computed?.getPropertyValue("font-family") || ""}
          onChange={(next) => setStyle("font-family", next || null)}
          unit=""
        />
      </FieldRow>
      <FieldRow label="size">
        <NumberInput
          value={inline["font-size"] ?? ""}
          computed={computed?.getPropertyValue("font-size") || ""}
          onChange={(next) => setStyle("font-size", next || null)}
        />
      </FieldRow>
      <FieldRow label="weight">
        <SelectInput
          value={inline["font-weight"] ?? ""}
          computed={computed?.getPropertyValue("font-weight") || ""}
          options={WEIGHT_OPTIONS}
          onChange={(next) => setStyle("font-weight", next || null)}
        />
      </FieldRow>
      <FieldRow label="line-h">
        <NumberInput
          value={inline["line-height"] ?? ""}
          computed={computed?.getPropertyValue("line-height") || ""}
          onChange={(next) => setStyle("line-height", next || null)}
          unit=""
        />
      </FieldRow>
      <FieldRow label="letter">
        <NumberInput
          value={inline["letter-spacing"] ?? ""}
          computed={computed?.getPropertyValue("letter-spacing") || ""}
          onChange={(next) => setStyle("letter-spacing", next || null)}
        />
      </FieldRow>
      <FieldRow label="color">
        <ColorInput
          value={inline.color ?? ""}
          computed={computed?.getPropertyValue("color") || ""}
          onChange={(next) => setStyle("color", next || null)}
        />
      </FieldRow>
      <FieldRow label="align">
        <SegmentedInput
          value={inline["text-align"] ?? ""}
          options={ALIGN_OPTIONS}
          onChange={(next) => setStyle("text-align", next || null)}
        />
      </FieldRow>
      <FieldRow label="style">
        <div className="flex items-center gap-1">
          <ToggleButton
            pressed={isItalic}
            onChange={(on) => setStyle("font-style", on ? "italic" : null)}
            label="italic"
            icon={<Italic size={12} />}
          />
          <ToggleButton
            pressed={isUnderline}
            onChange={(on) => setDecoration("underline", on)}
            label="underline"
            icon={<Underline size={12} />}
          />
          <ToggleButton
            pressed={isStrike}
            onChange={(on) => setDecoration("line-through", on)}
            label="strikethrough"
            icon={<Strikethrough size={12} />}
          />
        </div>
      </FieldRow>
      <FieldRow label="transform">
        <SelectInput
          value={inline["text-transform"] ?? ""}
          computed={computed?.getPropertyValue("text-transform") || ""}
          options={TRANSFORM_OPTIONS}
          onChange={(next) =>
            setStyle("text-transform", next === "none" ? null : next || null)
          }
        />
      </FieldRow>
    </Section>
  );
}
