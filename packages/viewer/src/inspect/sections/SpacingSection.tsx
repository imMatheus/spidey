import { useEffect, useState, type ReactNode } from "react";
import type { SpideyNode } from "@spidey/shared";
import { Input } from "@/components/ui/input";
import { CollapsibleSection } from "../inputs";

const PADDING = [
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
] as const;
const MARGIN = [
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
] as const;
const BORDER = [
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
] as const;

type Tint = "amber" | "stone" | "emerald";

const RING_BG: Record<Tint, string> = {
  amber: "bg-amber-500/15 border-amber-500/40",
  stone: "bg-stone-500/15 border-stone-500/40",
  emerald: "bg-emerald-500/15 border-emerald-500/40",
};
const RING_FG: Record<Tint, string> = {
  amber: "text-amber-500/90",
  stone: "text-stone-300/90",
  emerald: "text-emerald-500/90",
};

/**
 * Editable box-model diagram. Three concentric rings — margin (amber), border
 * (stone), padding (emerald) — each with four bare NumberInputs centered on
 * their edges. Center shows the element's rendered width × height.
 */
export function SpacingSection({
  node,
  computed,
  setStyle,
}: {
  node: SpideyNode & { kind: "el" };
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const inline = node.style;
  const w = roundDim(computed?.getPropertyValue("width") || "");
  const h = roundDim(computed?.getPropertyValue("height") || "");

  return (
    <CollapsibleSection title="Spacing">
      <div className="px-4 pb-4 pt-1">
        <Ring
          label="margin"
          tint="amber"
          props={MARGIN}
          inline={inline}
          computed={computed}
          setStyle={setStyle}
        >
          <Ring
            label="border"
            tint="stone"
            props={BORDER}
            inline={inline}
            computed={computed}
            setStyle={setStyle}
          >
            <Ring
              label="padding"
              tint="emerald"
              props={PADDING}
              inline={inline}
              computed={computed}
              setStyle={setStyle}
            >
              <div className="h-6 flex items-center justify-center bg-muted/60 text-foreground text-[10px] font-mono rounded-sm">
                {w && h ? `${w} × ${h}` : "—"}
              </div>
            </Ring>
          </Ring>
        </Ring>
      </div>
    </CollapsibleSection>
  );
}

function Ring({
  label,
  tint,
  props,
  inline,
  computed,
  setStyle,
  children,
}: {
  label: string;
  tint: Tint;
  props: readonly [string, string, string, string];
  inline: Record<string, string>;
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
  children: ReactNode;
}) {
  const get = (p: string) => inline[p] ?? "";
  const cmp = (p: string) => computed?.getPropertyValue(p) || "";
  const set = (p: string, v: string) => setStyle(p, v || null);

  return (
    <div
      className={`relative border border-dashed rounded-md p-1.5 ${RING_BG[tint]}`}
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1">
        <span
          className={`text-[9px] uppercase tracking-[0.5px] font-mono ${RING_FG[tint]}`}
        >
          {label}
        </span>
        <div className="flex justify-center">
          <BoxNumberInput
            value={get(props[0])}
            computed={cmp(props[0])}
            onChange={(v) => set(props[0], v)}
          />
        </div>
        {/* Mirror label width so the top input stays visually centered. */}
        <span
          aria-hidden
          className="text-[9px] uppercase tracking-[0.5px] font-mono invisible"
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <BoxNumberInput
          value={get(props[3])}
          computed={cmp(props[3])}
          onChange={(v) => set(props[3], v)}
          vertical
        />
        <div className="flex-1 min-w-0">{children}</div>
        <BoxNumberInput
          value={get(props[1])}
          computed={cmp(props[1])}
          onChange={(v) => set(props[1], v)}
          vertical
        />
      </div>
      <div className="flex justify-center">
        <BoxNumberInput
          value={get(props[2])}
          computed={cmp(props[2])}
          onChange={(v) => set(props[2], v)}
        />
      </div>
    </div>
  );
}

/**
 * Bare-number input for the box diagram. Transparent by default, gets a chip
 * background on hover/focus so the diagram stays uncluttered until edited.
 */
function BoxNumberInput({
  value,
  computed,
  onChange,
  vertical,
}: {
  value: string;
  computed: string;
  onChange: (next: string) => void;
  vertical?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = (next: string) => {
    let trimmed = next.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      trimmed = `${trimmed}px`;
    }
    if (trimmed === value) return;
    onChange(trimmed);
    setDraft(trimmed);
  };
  const step = (delta: number) => {
    const m = (draft || computed || "").match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    const base = m ? parseFloat(m[1]) : 0;
    const unit = (m && m[2].trim()) || "px";
    const n = Math.round((base + delta) * 1000) / 1000;
    const next = `${n}${unit}`;
    setDraft(next);
    onChange(next);
  };
  const widthCls = vertical ? "w-8" : "w-10";
  return (
    <Input
      type="text"
      value={draft}
      placeholder={normalizeShort(computed) || "0"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          step(e.shiftKey ? 10 : 1);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          step(e.shiftKey ? -10 : -1);
        }
      }}
      className={`h-5 ${widthCls} px-0.5 py-0 text-[10px] font-mono text-center rounded-sm border-transparent bg-transparent shadow-none hover:bg-background/60 focus-visible:bg-background focus-visible:border-input dark:bg-transparent dark:hover:bg-background/60 dark:focus-visible:bg-background`}
    />
  );
}

function normalizeShort(v: string): string {
  if (!v) return "";
  return v.replace(/^0px$/, "0");
}

function roundDim(v: string): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}
