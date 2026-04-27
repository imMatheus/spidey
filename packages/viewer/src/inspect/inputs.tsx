import { useEffect, useState, type ReactNode } from "react";
import { Link2, Link2Off } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const INPUT_CLASS = "h-7 px-1.5 py-1 text-[11px] font-mono rounded-md";

/** Two-column row with label + control. */
export function FieldRow({
  label,
  children,
  htmlFor,
}: {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <>
      <label
        className="text-muted-foreground/70 font-mono self-center"
        htmlFor={htmlFor}
      >
        {label}
      </label>
      <div className="min-w-0 flex items-center gap-1.5">{children}</div>
    </>
  );
}

/** Section wrapper used by every section component. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="text-[10px] uppercase tracking-[0.6px] text-muted-foreground/70 px-3 pt-3 pb-1">
        {title}
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 px-3 pb-3 text-[11px] items-center">
        {children}
      </div>
    </div>
  );
}

/**
 * Plain text input with computed-style as placeholder. Commits on blur or
 * Enter; Escape reverts. Up/Down arrow keys step the trailing number by 1
 * (10 with Shift) and commit immediately. Returning value === "" clears the
 * inline style.
 */
export function NumberInput({
  value,
  computed,
  onChange,
  disabled,
  unit = "px",
}: {
  value: string;
  computed?: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  unit?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (next: string) => {
    let trimmed = next.trim();
    // Auto-append unit when the user typed a bare number and a unit makes
    // sense (e.g. "12" → "12px"). Properties that take unitless numbers pass
    // unit="".
    if (unit && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      trimmed = `${trimmed}${unit}`;
    }
    if (trimmed === value) return;
    onChange(trimmed);
    // Reflect the normalized form back into the local draft so the field
    // doesn't snap back to the bare number on the next render race.
    setDraft(trimmed);
  };

  const step = (delta: number) => {
    const m = (draft || computed || "").match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const n = parseFloat(m[1]) + delta;
    const u = m[2].trim() || unit;
    const next = `${Math.round(n * 1000) / 1000}${u}`;
    setDraft(next);
    onChange(next);
  };

  return (
    <Input
      type="text"
      value={draft}
      placeholder={computed || "—"}
      disabled={disabled}
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
      className={INPUT_CLASS}
    />
  );
}

/** Native color swatch + hex/value text input. */
export function ColorInput({
  value,
  computed,
  onChange,
  disabled,
}: {
  value: string;
  computed?: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === value) return;
    onChange(trimmed);
  };

  const hex = toHex(value || computed || "");

  return (
    <>
      <input
        type="color"
        value={hex}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        className="w-5 h-5 bg-transparent border border-input rounded cursor-pointer p-0 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Input
        type="text"
        value={draft}
        placeholder={computed || "—"}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className={INPUT_CLASS + " flex-1 min-w-0"}
      />
    </>
  );
}

/** Dropdown select. Empty string option clears the inline value. */
export function SelectInput({
  value,
  computed,
  options,
  onChange,
  disabled,
}: {
  value: string;
  computed?: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || "__none__"}
      disabled={disabled}
      onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
    >
      <SelectTrigger size="sm" className="h-7 text-[11px] font-mono w-full">
        <SelectValue placeholder={computed || "—"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__" className="text-[11px] font-mono">
          {computed ? `auto (${computed})` : "—"}
        </SelectItem>
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="text-[11px] font-mono"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Mutually-exclusive icon row. value === "" means no inline value set. */
export function SegmentedInput({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { value: string; icon: ReactNode; label: string }[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v)}
      className="w-full"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.label}
          title={o.label}
          className="flex-1 h-7 px-1"
        >
          {o.icon}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Single icon toggle (italic / underline / etc). */
export function ToggleButton({
  pressed,
  onChange,
  label,
  icon,
  disabled,
}: {
  pressed: boolean;
  onChange: (next: boolean) => void;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Toggle
      size="sm"
      variant="outline"
      pressed={pressed}
      disabled={disabled}
      onPressedChange={onChange}
      aria-label={label}
      title={label}
      className="h-7 w-7 px-0"
    >
      {icon}
    </Toggle>
  );
}

/**
 * Four NumberInputs arranged T/R/B/L with a chain-link toggle. When linked,
 * editing any side writes the same value to all four; when unlinked, each
 * writes independently. Reads inline values from `inline[prop]` and falls
 * back to `computed[prop]` for placeholder display.
 *
 * Pass an explicit `disabled` to disable all four (used for offsets when
 * position: static).
 */
export function FourSideInput({
  props,
  inline,
  computed,
  setStyle,
  labels = ["T", "R", "B", "L"],
  disabled,
}: {
  /** [top, right, bottom, left] CSS prop names */
  props: [string, string, string, string];
  inline: Record<string, string>;
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
  labels?: [string, string, string, string];
  disabled?: boolean;
}) {
  const [linked, setLinked] = useState(false);
  const values = props.map((p) => inline[p] ?? "") as [string, string, string, string];
  const computedValues = props.map((p) => computed?.getPropertyValue(p) || "") as [
    string,
    string,
    string,
    string,
  ];

  const onChange = (i: number, next: string) => {
    if (linked) {
      // Write same value to all four — single dispatch each. The reducer
      // batches per-action; this fires four actions but undoes one-by-one.
      // Acceptable for v1; chain-link is an authoring affordance, not a
      // transaction boundary.
      props.forEach((p) => setStyle(p, next || null));
    } else {
      setStyle(props[i], next || null);
    }
  };

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
        {values.map((v, i) => (
          <div key={props[i]} className="flex flex-col items-center gap-0.5 min-w-0">
            <NumberInput
              value={v}
              computed={computedValues[i]}
              onChange={(next) => onChange(i, next)}
              disabled={disabled}
            />
            <span className="text-[9px] text-muted-foreground/60 font-mono">
              {labels[i]}
            </span>
          </div>
        ))}
      </div>
      <Toggle
        size="sm"
        variant="outline"
        pressed={linked}
        onPressedChange={setLinked}
        aria-label={linked ? "Unlink sides" : "Link sides"}
        title={linked ? "Unlink sides" : "Link sides"}
        disabled={disabled}
        className="h-7 w-7 px-0 shrink-0 self-start"
      >
        {linked ? <Link2 size={12} /> : <Link2Off size={12} />}
      </Toggle>
    </div>
  );
}

/**
 * Four corners of border-radius (TL/TR/BR/BL) with chain-link toggle.
 */
export function FourCornerInput({
  inline,
  computed,
  setStyle,
}: {
  inline: Record<string, string>;
  computed: CSSStyleDeclaration | null;
  setStyle: (prop: string, value: string | null) => void;
}) {
  const corners: [string, string][] = [
    ["border-top-left-radius", "TL"],
    ["border-top-right-radius", "TR"],
    ["border-bottom-right-radius", "BR"],
    ["border-bottom-left-radius", "BL"],
  ];
  return (
    <FourSideInput
      props={corners.map((c) => c[0]) as [string, string, string, string]}
      inline={inline}
      computed={computed}
      setStyle={setStyle}
      labels={corners.map((c) => c[1]) as [string, string, string, string]}
    />
  );
}

/**
 * Wraps any disabled control with a tooltip explaining why it's disabled.
 * Tooltip appears on hover regardless of disabled state of the trigger.
 */
export function DisabledHint({
  disabled,
  hint,
  children,
}: {
  disabled: boolean;
  hint: string;
  children: ReactNode;
}) {
  if (!disabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="w-full">{children}</div>
      </TooltipTrigger>
      <TooltipContent side="left">{hint}</TooltipContent>
    </Tooltip>
  );
}

/** Pick the inline value when set; else the computed value. */
export function resolveStyle(
  prop: string,
  inline: Record<string, string>,
  computed: CSSStyleDeclaration | null,
): string {
  return inline[prop] ?? (computed?.getPropertyValue(prop) || "");
}

function toHex(value: string): string {
  if (!value) return "#000000";
  const s = value.trim();
  if (s.startsWith("#") && (s.length === 7 || s.length === 4)) {
    if (s.length === 4) {
      return (
        "#" +
        s
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      );
    }
    return s;
  }
  const m = s.match(/rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/i);
  if (m) {
    const [, r, g, b] = m;
    const toH = (n: number) =>
      Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    return "#" + toH(+r) + toH(+g) + toH(+b);
  }
  return "#000000";
}
