import type { SpideyNode } from "@spidey/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import type { EditAction } from "../../editor/state";
import { CollapsibleSection, FieldRow } from "../inputs";

/**
 * Inspector section for form-control nodes (`<input>`, `<textarea>`,
 * `<select>`). Captures `defaultValue` / `defaultChecked` round-trip via
 * the `value` and `checked` HTML attributes, so editing here writes
 * `setAttr` against the captured node and the live tile DOM updates on
 * the next render.
 *
 * Returns `null` for non-form nodes — the calling Inspector simply
 * doesn't render the section in that case.
 */
export function ValueSection({
  node,
  tileId,
  dispatch,
}: {
  node: SpideyNode & { kind: "el" };
  tileId: string;
  dispatch: (a: EditAction) => void;
}) {
  if (node.tag !== "input" && node.tag !== "textarea" && node.tag !== "select")
    return null;

  const setAttr = (name: string, value: string | null) =>
    dispatch({ type: "setAttr", tileId, nodeId: node.id, name, value });

  if (node.tag === "input") return <InputBody node={node} setAttr={setAttr} />;
  if (node.tag === "textarea")
    return <TextareaBody node={node} setAttr={setAttr} />;
  return <SelectBody node={node} setAttr={setAttr} />;
}

function InputBody({
  node,
  setAttr,
}: {
  node: SpideyNode & { kind: "el" };
  setAttr: (name: string, value: string | null) => void;
}) {
  const type = (node.attrs.type ?? "text").toLowerCase();
  const value = node.attrs.value ?? "";
  const placeholder = node.attrs.placeholder ?? "";
  const checked = node.attrs.checked != null;

  // Boolean controls — checked-state instead of value
  if (type === "checkbox" || type === "radio") {
    return (
      <CollapsibleSection title="Value">
        <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-4 pb-3 text-[11px] items-center">
          <FieldRow label="Type">
            <span className="font-mono text-muted-foreground">{type}</span>
          </FieldRow>
          <FieldRow label="Checked">
            <Toggle
              size="sm"
              variant="outline"
              pressed={checked}
              onPressedChange={(next) =>
                setAttr("checked", next ? "" : null)
              }
              className="h-7 px-3 text-[11px]"
              aria-label={checked ? "Uncheck" : "Check"}
            >
              {checked ? "checked" : "unchecked"}
            </Toggle>
          </FieldRow>
          <FieldRow label="Name">
            <Input
              value={node.attrs.name ?? ""}
              placeholder="(none)"
              onChange={(e) => setAttr("name", e.target.value || null)}
              className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
            />
          </FieldRow>
        </div>
      </CollapsibleSection>
    );
  }

  // Range slider — show value + min/max/step
  if (type === "range") {
    return (
      <CollapsibleSection title="Value">
        <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-4 pb-3 text-[11px] items-center">
          <FieldRow label="Value">
            <Input
              value={value}
              onChange={(e) => setAttr("value", e.target.value || null)}
              className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
            />
          </FieldRow>
          <FieldRow label="Min">
            <Input
              value={node.attrs.min ?? ""}
              onChange={(e) => setAttr("min", e.target.value || null)}
              className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
            />
          </FieldRow>
          <FieldRow label="Max">
            <Input
              value={node.attrs.max ?? ""}
              onChange={(e) => setAttr("max", e.target.value || null)}
              className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
            />
          </FieldRow>
          <FieldRow label="Step">
            <Input
              value={node.attrs.step ?? ""}
              onChange={(e) => setAttr("step", e.target.value || null)}
              className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
            />
          </FieldRow>
        </div>
      </CollapsibleSection>
    );
  }

  // Generic text-shaped input (text, email, password, number, search, tel,
  // url, date, etc.). Editing rewrites the `value` attribute live.
  return (
    <CollapsibleSection title="Value">
      <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-4 pb-3 text-[11px] items-center">
        <FieldRow label="Type">
          <span className="font-mono text-muted-foreground">{type}</span>
        </FieldRow>
        <FieldRow label="Value">
          <Input
            value={value}
            placeholder={placeholder || "(empty)"}
            onChange={(e) => setAttr("value", e.target.value || null)}
            className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
          />
        </FieldRow>
        <FieldRow label="Placeholder">
          <Input
            value={placeholder}
            onChange={(e) => setAttr("placeholder", e.target.value || null)}
            className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
          />
        </FieldRow>
      </div>
    </CollapsibleSection>
  );
}

function TextareaBody({
  node,
  setAttr,
}: {
  node: SpideyNode & { kind: "el" };
  setAttr: (name: string, value: string | null) => void;
}) {
  // <textarea> stores its value as text-children, not as a `value` attr.
  // We surface the rendered text here for completeness, and editing
  // attributes (rows/cols/placeholder) writes attrs. Live text editing
  // for the body content is owned by ContentSection above.
  return (
    <CollapsibleSection title="Value">
      <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-4 pb-3 text-[11px] items-center">
        <FieldRow label="Placeholder">
          <Input
            value={node.attrs.placeholder ?? ""}
            onChange={(e) => setAttr("placeholder", e.target.value || null)}
            className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
          />
        </FieldRow>
        <FieldRow label="Rows">
          <Input
            value={node.attrs.rows ?? ""}
            onChange={(e) => setAttr("rows", e.target.value || null)}
            className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
          />
        </FieldRow>
        <FieldRow label="Cols">
          <Input
            value={node.attrs.cols ?? ""}
            onChange={(e) => setAttr("cols", e.target.value || null)}
            className="h-7 px-1.5 py-1 text-[11px] font-mono rounded-md"
          />
        </FieldRow>
      </div>
      <div className="px-4 pb-3">
        <div className="text-[10px] uppercase tracking-[0.6px] text-muted-foreground/70 pb-1">
          Body
        </div>
        <Textarea
          value={extractTextareaValue(node)}
          onChange={(e) => setTextareaValue(node, e.target.value, setAttr)}
          className="min-h-12 px-2 py-1.5 text-xs font-mono resize-y"
          rows={3}
        />
      </div>
    </CollapsibleSection>
  );
}

function extractTextareaValue(node: SpideyNode & { kind: "el" }): string {
  // Aggregate any text children — captures preserved as a single text run.
  return node.children
    .filter((c): c is SpideyNode & { kind: "text" } => c.kind === "text")
    .map((t) => t.value)
    .join("");
}

function setTextareaValue(
  _node: SpideyNode & { kind: "el" },
  next: string,
  setAttr: (name: string, value: string | null) => void,
): void {
  // For round-trip safety we mirror the value into a `value` attr too —
  // some browsers honor that on <textarea> for initial display, and the
  // attribute survives serialization. The actual textContent is owned by
  // ContentSection; if the user has a textarea selected they'll typically
  // edit there. This row is convenience for short overrides.
  setAttr("value", next || null);
}

function SelectBody({
  node,
  setAttr,
}: {
  node: SpideyNode & { kind: "el" };
  setAttr: (name: string, value: string | null) => void;
}) {
  // Find the option children. Each <option> may have a `value` attr or
  // fall back to its text content. Pick the currently-selected one
  // (the option carrying `selected`) or the parent select's `value` attr.
  const options = collectOptions(node);
  const explicit = node.attrs.value;
  const fromOptions = options.find((o) => o.selected)?.value;
  const current = explicit ?? fromOptions ?? options[0]?.value ?? "";

  return (
    <CollapsibleSection title="Value">
      <div className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-4 pb-3 text-[11px] items-center">
        <FieldRow label="Selected">
          <Select
            value={current}
            onValueChange={(v) => setAttr("value", v || null)}
          >
            <SelectTrigger
              size="sm"
              className="h-7 text-[11px] font-mono w-full"
            >
              <SelectValue placeholder="(none)" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem
                  key={o.id}
                  value={o.value}
                  className="text-[11px] font-mono"
                >
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>
    </CollapsibleSection>
  );
}

type CollectedOption = {
  id: string;
  value: string;
  label: string;
  selected: boolean;
};

function collectOptions(node: SpideyNode): CollectedOption[] {
  const out: CollectedOption[] = [];
  walk(node);
  return out;

  function walk(n: SpideyNode) {
    if (n.kind === "text") return;
    if (n.tag === "option") {
      const text = n.children
        .filter((c): c is SpideyNode & { kind: "text" } => c.kind === "text")
        .map((t) => t.value)
        .join("")
        .trim();
      const value = n.attrs.value ?? text;
      // SelectItem rejects empty-string values — Radix uses "" as "no
      // selection" sentinel. Skip empty options; they'd never match anyway.
      if (!value) return;
      out.push({
        id: n.id,
        value,
        label: text || value,
        selected: n.attrs.selected != null,
      });
      return;
    }
    for (const c of n.children) walk(c);
  }
}
