import { useEffect, useState } from "react";
import type { SpideyNode } from "@spidey/shared";
import { Textarea } from "@/components/ui/textarea";
import type { EditAction } from "../../editor/state";

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
    <div className="border-b border-border">
      <div className="text-[10px] uppercase tracking-[0.6px] text-muted-foreground/70 px-3 pt-3 pb-1">
        Content
      </div>
      <div className="px-3 pb-3 flex flex-col gap-1.5">
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
    </div>
  );
}

function TextRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (next: string) => {
    if (next === value) return;
    onChange(next);
  };

  return (
    <Textarea
      value={draft}
      placeholder="(empty)"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      // field-sizing-content auto-grows but disables manual resize on
      // some browsers — drop it so the bottom-right grip works.
      className="min-h-12 px-2 py-1.5 text-xs font-mono resize-y [field-sizing:fixed]"
      rows={2}
    />
  );
}
