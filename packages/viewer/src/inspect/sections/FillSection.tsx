import type { SpideyNode } from "@spidey/shared";
import { ColorInput, FieldRow, Section } from "../inputs";

export function FillSection({
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
    <Section title="Fill">
      <FieldRow label="background">
        <ColorInput
          value={inline["background-color"] ?? inline.background ?? ""}
          computed={computed?.getPropertyValue("background-color") || ""}
          onChange={(next) => setStyle("background-color", next || null)}
        />
      </FieldRow>
    </Section>
  );
}
