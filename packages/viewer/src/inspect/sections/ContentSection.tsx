import type { SpideyNode } from "@spidey/shared";
import { Textarea } from "@/components/ui/textarea";
import type { EditAction } from "../../editor/state";
import { CollapsibleSection } from "../inputs";

/**
 * Editable text content for the selected element. Lists every direct
 * child that is a text node — each becomes its own input. Mixed-content
 * elements (text + child elements) get one input per text run, in order;
 * pure-element parents (no direct text children) render nothing.
 *
 * Each commit dispatches a `setText` action targeting the text-leaf's id,
 * so undo/redo works at the granularity of a single text edit.
 */
export function ContentSection({
  node,
  tileId,
  dispatch,
}: {
  node: SpideyNode & { kind: "el" };
  tileId: string;
  dispatch: (a: EditAction) => void;
}) {
  const textChildren = node.children.filter(
    (c): c is SpideyNode & { kind: "text" } => c.kind === "text",
  );
  if (textChildren.length === 0) return null;

  return (
    <CollapsibleSection title="Content">
      <div className="px-4 pb-3 flex flex-col gap-1.5">
        {textChildren.map((t) => (
          <TextRow
            key={t.id}
            value={t.value}
            onChange={(text) =>
              dispatch({ type: "setText", tileId, nodeId: t.id, text })
            }
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function TextRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Fully controlled — every keystroke dispatches setText so the live tile
  // mirrors the inspector instantly. The reducer rebuilds the tree
  // structurally; the rendered DOM updates via Tile's re-mount-on-rev.
  return (
    <Textarea
      value={value}
      placeholder="(empty)"
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape")
          (e.target as HTMLTextAreaElement).blur();
      }}
      className="min-h-12 px-2 py-1.5 text-xs font-mono resize-y [field-sizing:fixed]"
      rows={2}
    />
  );
}
