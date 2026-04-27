import type { SpideyNode } from "@spidey/shared";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
} from "lucide-react";
import {
  FieldRow,
  NumberInput,
  Section,
  SegmentedInput,
  SelectInput,
  resolveStyle,
} from "../inputs";

const DISPLAY_OPTIONS = [
  { value: "block", label: "block" },
  { value: "inline", label: "inline" },
  { value: "inline-block", label: "inline-block" },
  { value: "flex", label: "flex" },
  { value: "inline-flex", label: "inline-flex" },
  { value: "grid", label: "grid" },
  { value: "none", label: "none" },
];

const FLEX_DIR_OPTIONS = [
  { value: "row", icon: <ArrowRight size={12} />, label: "row" },
  { value: "row-reverse", icon: <ArrowLeft size={12} />, label: "row-reverse" },
  { value: "column", icon: <ArrowDown size={12} />, label: "column" },
  { value: "column-reverse", icon: <ArrowUp size={12} />, label: "column-reverse" },
];

const JUSTIFY_OPTIONS = [
  { value: "flex-start", icon: <AlignStartVertical size={12} />, label: "start" },
  { value: "center", icon: <AlignCenterVertical size={12} />, label: "center" },
  { value: "flex-end", icon: <AlignEndVertical size={12} />, label: "end" },
  { value: "space-between", icon: <span className="text-[10px] font-mono">↔</span>, label: "between" },
];

const ALIGN_OPTIONS = [
  { value: "flex-start", icon: <AlignStartHorizontal size={12} />, label: "start" },
  { value: "center", icon: <AlignCenterHorizontal size={12} />, label: "center" },
  { value: "flex-end", icon: <AlignEndHorizontal size={12} />, label: "end" },
  { value: "stretch", icon: <span className="text-[10px] font-mono">⇕</span>, label: "stretch" },
];

export function LayoutSection({
  node,
  computed,
  setStyle,
}: {
  node: SpideyNode & { kind: "el" };
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const inline = node.style;
  const displayResolved = resolveStyle("display", inline, computed);
  const isFlex =
    displayResolved === "flex" || displayResolved === "inline-flex";

  return (
    <Section title="Layout">
      <FieldRow label="Width">
        <NumberInput
          value={inline.width ?? ""}
          computed={computed?.getPropertyValue("width") || ""}
          onChange={(next) => setStyle("width", next || null)}
        />
      </FieldRow>
      <FieldRow label="Height">
        <NumberInput
          value={inline.height ?? ""}
          computed={computed?.getPropertyValue("height") || ""}
          onChange={(next) => setStyle("height", next || null)}
        />
      </FieldRow>
      <FieldRow label="Display">
        <SelectInput
          value={inline.display ?? ""}
          computed={computed?.getPropertyValue("display") || ""}
          options={DISPLAY_OPTIONS}
          onChange={(next) => setStyle("display", next || null)}
        />
      </FieldRow>
      {isFlex && (
        <>
          <FieldRow label="Direction">
            <SegmentedInput
              value={inline["flex-direction"] ?? ""}
              options={FLEX_DIR_OPTIONS}
              onChange={(next) => setStyle("flex-direction", next || null)}
            />
          </FieldRow>
          <FieldRow label="Justify">
            <SegmentedInput
              value={inline["justify-content"] ?? ""}
              options={JUSTIFY_OPTIONS}
              onChange={(next) => setStyle("justify-content", next || null)}
            />
          </FieldRow>
          <FieldRow label="Align">
            <SegmentedInput
              value={inline["align-items"] ?? ""}
              options={ALIGN_OPTIONS}
              onChange={(next) => setStyle("align-items", next || null)}
            />
          </FieldRow>
          <FieldRow label="Gap">
            <NumberInput
              value={inline.gap ?? ""}
              computed={computed?.getPropertyValue("gap") || ""}
              onChange={(next) => setStyle("gap", next || null)}
            />
          </FieldRow>
        </>
      )}
    </Section>
  );
}
