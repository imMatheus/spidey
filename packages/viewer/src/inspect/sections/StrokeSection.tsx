import type { SpideyNode } from "@spidey/shared";
import {
  ColorInput,
  FieldRow,
  FourCornerInput,
  FourSideInput,
  Section,
  SelectInput,
} from "../inputs";

const STYLE_OPTIONS = [
  { value: "none", label: "none" },
  { value: "solid", label: "solid" },
  { value: "dashed", label: "dashed" },
  { value: "dotted", label: "dotted" },
  { value: "double", label: "double" },
];

export function StrokeSection({
  node,
  computed,
  setStyle,
}: {
  node: SpideyNode & { kind: "el" };
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const inline = node.style;
  return (
    <Section title="Stroke">
      <FieldRow label="Width">
        <FourSideInput
          props={[
            "border-top-width",
            "border-right-width",
            "border-bottom-width",
            "border-left-width",
          ]}
          inline={inline}
          computed={computed}
          setStyle={setStyle}
        />
      </FieldRow>
      <FieldRow label="Color">
        <ColorInput
          value={inline["border-color"] ?? inline["border-top-color"] ?? ""}
          computed={computed?.getPropertyValue("border-top-color") || ""}
          onChange={(next) => setStyle("border-color", next || null)}
        />
      </FieldRow>
      <FieldRow label="Style">
        <SelectInput
          value={inline["border-style"] ?? inline["border-top-style"] ?? ""}
          computed={computed?.getPropertyValue("border-top-style") || ""}
          options={STYLE_OPTIONS}
          onChange={(next) => setStyle("border-style", next || null)}
        />
      </FieldRow>
      <FieldRow label="Radius">
        <FourCornerInput
          inline={inline}
          computed={computed}
          setStyle={setStyle}
        />
      </FieldRow>
    </Section>
  );
}
