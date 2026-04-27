import { useEffect, useState } from "react";
import { CollapsibleSection } from "../inputs";

/**
 * Surfaces ::before / ::after pseudo-element styles for the selected
 * element. Pseudo-elements aren't in the DOM tree, so they can't be
 * selected directly — without this section the user has no signal that
 * a tooltip's `content: attr(data-tip)` even exists.
 *
 * v1: read-only display. The values come from `getComputedStyle(el,
 * "::after")` etc., so we see whatever cascade actually applies. We hide
 * the section when neither pseudo has any of the "interesting" properties
 * set (content, background, border) — empty pseudos exist on every
 * element and surfacing them would be noise.
 */
export function PseudoSection({ el }: { el: HTMLElement }) {
  const before = useComputedPseudo(el, "::before");
  const after = useComputedPseudo(el, "::after");

  const hasBefore = before && pseudoIsRendered(before);
  const hasAfter = after && pseudoIsRendered(after);
  if (!hasBefore && !hasAfter) return null;

  return (
    <CollapsibleSection title="Pseudo-elements" defaultOpen={false}>
      <div className="px-4 pb-3 flex flex-col gap-3">
        {hasBefore && before && <PseudoBlock label="::before" s={before} />}
        {hasAfter && after && <PseudoBlock label="::after" s={after} />}
      </div>
    </CollapsibleSection>
  );
}

function PseudoBlock({
  label,
  s,
}: {
  label: string;
  s: PseudoSnapshot;
}) {
  return (
    <div className="rounded-sm border border-border bg-muted/30 px-2.5 py-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-primary font-semibold">
          {label}
        </span>
        <ColorChip color={s.color} />
      </div>
      {s.content && s.content !== "none" && (
        <Row k="content" v={s.content} mono />
      )}
      {s.background && s.background !== "none" && (
        <Row k="background" v={s.background} />
      )}
      {s.border && s.border !== "none" && <Row k="border" v={s.border} />}
      {s.position && s.position !== "static" && (
        <Row k="position" v={s.position} />
      )}
      <div className="text-[10px] text-muted-foreground/70 pt-1 italic">
        Edit the matched CSS rule in the source file — pseudo-elements
        aren't in the captured DOM.
      </div>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
}: {
  k: string;
  v: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 items-baseline">
      <span className="text-[10px] text-muted-foreground uppercase tracking-[0.5px]">
        {k}
      </span>
      <span
        className={
          "text-[11px] text-foreground break-words" +
          (mono ? " font-mono" : "")
        }
      >
        {v}
      </span>
    </div>
  );
}

function ColorChip({ color }: { color: string }) {
  if (!color || color === "transparent") return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-border/60"
      style={{ background: color }}
      title={color}
    />
  );
}

type PseudoSnapshot = {
  content: string;
  color: string;
  background: string;
  border: string;
  position: string;
};

function useComputedPseudo(
  el: HTMLElement,
  which: "::before" | "::after",
): PseudoSnapshot | null {
  const [snap, setSnap] = useState<PseudoSnapshot | null>(null);
  useEffect(() => {
    try {
      // Resolving styles on a pseudo of an element living inside a
      // shadow root is supported in evergreen browsers but we still
      // guard — getComputedStyle throws on detached nodes.
      const cs = getComputedStyle(el, which);
      setSnap({
        content: cs.getPropertyValue("content").trim(),
        color: cs.getPropertyValue("color").trim(),
        background: cs.getPropertyValue("background").trim(),
        border: cs.getPropertyValue("border").trim(),
        position: cs.getPropertyValue("position").trim(),
      });
    } catch {
      setSnap(null);
    }
  }, [el, which]);
  return snap;
}

/** Cheap heuristic: a pseudo "exists" only when content is set. The
 *  default for every element is `content: normal` (≡ unrendered). */
function pseudoIsRendered(s: PseudoSnapshot): boolean {
  const c = s.content;
  if (!c) return false;
  if (c === "normal" || c === "none") return false;
  return true;
}
