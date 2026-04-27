import type { SpideyNode } from "@spidey/shared";
import {
  FieldRow,
  FourSideInput,
  NumberInput,
  Section,
  SelectInput,
  resolveStyle,
} from "../inputs";

const POSITION_OPTIONS = [
  { value: "static", label: "static" },
  { value: "relative", label: "relative" },
  { value: "absolute", label: "absolute" },
  { value: "fixed", label: "fixed" },
  { value: "sticky", label: "sticky" },
];

export function PositionSection({
  node,
  computed,
  setStyle,
}: {
  node: SpideyNode & { kind: "el" };
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const inline = node.style;
  const positionResolved = resolveStyle("position", inline, computed) || "static";
  const isStatic = positionResolved === "static";

  return (
    <Section title="Position">
      <FieldRow label="position">
        <SelectInput
          value={inline.position ?? ""}
          computed={computed?.getPropertyValue("position") || ""}
          options={POSITION_OPTIONS}
          onChange={(next) => setStyle("position", next || null)}
        />
      </FieldRow>
      <FieldRow label="offsets">
        <FourSideInput
          props={["top", "right", "bottom", "left"]}
          inline={inline}
          computed={computed}
          setStyle={setStyle}
          disabled={isStatic}
        />
      </FieldRow>
      <FieldRow label="z-index">
        <NumberInput
          value={inline["z-index"] ?? ""}
          computed={computed?.getPropertyValue("z-index") || ""}
          onChange={(next) => setStyle("z-index", next || null)}
          disabled={isStatic}
          unit=""
        />
      </FieldRow>
    </Section>
  );
}
