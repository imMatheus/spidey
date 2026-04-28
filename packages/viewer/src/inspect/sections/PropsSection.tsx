import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CollapsibleSection } from "../inputs";
import { NOOP_FN_SENTINEL } from "@spidey/shared";

/**
 * Editable props for a component, parameterized by mode:
 *
 * - **master**: edits `tile.component.propsUsed`, triggers a backend
 *   recapture to re-render the preview tile. The user sees the visual
 *   update once the new tree comes back.
 * - **instance**: edits the `data-spidey-props` attribute on a captured
 *   instance node. No visual update (the captured DOM doesn't re-run
 *   React) — these edits flow into the agent-handoff change log only.
 *
 * Both modes share the same recursive labeled-field UI, so the
 * difference is just where the commit lands. The Inspector picks the
 * mode based on whether the active tile is a master and whether the
 * selected node is at the master's component root.
 *
 * Object/array props render recursively as nested labeled fields, so
 * you don't have to hand-edit JSON unless the structure is too deep
 * (capped at MAX_DEPTH) — beyond that we fall through to a raw JSON
 * textarea so things stay editable but don't blow out the inspector.
 */
const MAX_DEPTH = 4;

export type PropsSectionMode =
  | {
      kind: "master";
      onCommit: (next: Record<string, unknown>) => void;
      pending: boolean;
      error: string | null;
    }
  | {
      kind: "instance";
      onCommit: (next: Record<string, unknown>) => void;
      onRawCommit: (text: string) => void;
    };

export function PropsSection({
  name,
  rawAttr,
  parsed,
  mode,
}: {
  name: string;
  /** Only meaningful in instance mode — used by the raw-text fallback
   *  when the parsed JSON is null. Master mode has no raw-attr concept
   *  (propsUsed is a structured value in the doc). */
  rawAttr: string | null;
  parsed: Record<string, unknown> | null;
  mode: PropsSectionMode;
}) {
  const setProp = (key: string, value: unknown) => {
    if (!parsed) return;
    mode.onCommit({ ...parsed, [key]: value });
  };

  return (
    <CollapsibleSection title={`<${name}>`}>
      <div className="px-4 pb-3 pt-1 flex flex-col gap-2">
        {parsed !== null ? (
          <ObjectFields
            value={parsed}
            onChange={(next) => mode.onCommit(next as Record<string, unknown>)}
            setEntry={setProp}
            depth={0}
          />
        ) : mode.kind === "instance" && rawAttr != null ? (
          <RawJsonFallback
            initial={rawAttr}
            onCommit={(text) => mode.onRawCommit(text)}
          />
        ) : (
          <div className="text-[11px] text-muted-foreground italic">
            no captured props
          </div>
        )}
        {mode.kind === "master" && mode.pending && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            re-rendering preview…
          </div>
        )}
        {mode.kind === "master" && mode.error && (
          <div className="text-[11px] text-destructive font-mono break-words">
            {mode.error}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          {mode.kind === "master"
            ? "Edits re-render this preview and propagate any structural changes to instances."
            : "Prop edits on instances don't re-render — they flow into the change log for code generation."}
        </p>
      </div>
    </CollapsibleSection>
  );
}

const INPUT_CLASS = "h-7 px-1.5 py-1 text-[11px] font-mono rounded-md w-full";

/** Renders an object's keys as a labeled field list at the top level,
 *  or as a collapsible group below depth 0. Keys are stable (no
 *  reordering), values are rendered with PropInput recursively. */
function ObjectFields({
  value,
  onChange,
  setEntry,
  depth,
}: {
  value: Record<string, unknown>;
  /** Called with a fully-replaced object when a child field changes.
   *  At depth 0, callers pass `commit` (which serializes + dispatches);
   *  deeper, callers route the new object up to their parent. */
  onChange: (next: Record<string, unknown>) => void;
  /** Optional shortcut: when provided, used instead of building a fresh
   *  object — saves an allocation at the top level where we already
   *  have a setProp closure. */
  setEntry?: (key: string, value: unknown) => void;
  depth: number;
}) {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic">
        {`{ }`}
      </div>
    );
  }
  const updateKey = (k: string, next: unknown) => {
    if (setEntry) setEntry(k, next);
    else onChange({ ...value, [k]: next });
  };
  return (
    <div className="flex flex-col gap-2.5 text-[11px] min-w-0">
      {entries.map(([k, v]) => (
        <FieldBlock key={k} label={k} depth={depth} value={v}>
          <PropInput
            value={v}
            onChange={(next) => updateKey(k, next)}
            depth={depth + 1}
          />
        </FieldBlock>
      ))}
    </div>
  );
}

/** Renders an array's items as labeled `[i]` fields, recursively. Keeps
 *  array length fixed; can't add/remove items here (that's a structural
 *  edit better done in source). */
function ArrayFields({
  value,
  onChange,
  depth,
}: {
  value: unknown[];
  onChange: (next: unknown[]) => void;
  depth: number;
}) {
  if (value.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground italic">{`[ ]`}</div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-[11px] min-w-0">
      {value.map((v, i) => (
        <FieldBlock key={i} label={`[${i}]`} depth={depth} value={v}>
          <PropInput
            value={v}
            onChange={(next) => {
              const arr = value.slice();
              arr[i] = next;
              onChange(arr);
            }}
            depth={depth + 1}
          />
        </FieldBlock>
      ))}
    </div>
  );
}

/** A label + control pair, where complex children render inside a
 *  Collapsible so deep objects don't dominate the panel. Primitives stay
 *  inline (label above, control below). */
function FieldBlock({
  label,
  depth,
  value,
  children,
}: {
  label: string;
  depth: number;
  value: unknown;
  children: React.ReactNode;
}) {
  const complex = value !== null && typeof value === "object";

  if (!complex) {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <label className="font-mono text-muted-foreground text-[11px]">
          {label}
        </label>
        {children}
      </div>
    );
  }

  // Complex value (object/array): wrap in a Collapsible so the user can
  // hide/show. Open by default at top level so the first thing the user
  // sees is the structure; collapsed by default deeper to avoid runaway
  // height. The `summary` shows a compact `{a, b, …}` / `[N]` so the
  // shape is visible while collapsed.
  const summary = describeComplex(value);
  return (
    <Collapsible defaultOpen={depth === 0} className="min-w-0">
      <CollapsibleTrigger className="group w-full flex items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors text-left">
        <span className="truncate">
          {label}
          <span className="ml-2 text-muted-foreground/60">{summary}</span>
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className="shrink-0 transition-transform duration-150 group-data-[state=closed]:-rotate-90"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-2 pl-2 border-l border-border">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function describeComplex(v: unknown): string {
  if (Array.isArray(v)) return `[${v.length}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v as object);
    if (keys.length === 0) return "{ }";
    const head = keys.slice(0, 3).join(", ");
    return `{ ${head}${keys.length > 3 ? ", …" : ""} }`;
  }
  return "";
}

function PropInput({
  value,
  onChange,
  depth,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  depth: number;
}) {
  if (value === NOOP_FN_SENTINEL) {
    return (
      <span className="text-muted-foreground italic font-mono text-[11px]">
        ƒ noop
      </span>
    );
  }
  if (typeof value === "boolean") {
    return <BooleanInput value={value} onChange={onChange} />;
  }
  if (typeof value === "number") {
    return <NumberPropInput value={value} onChange={onChange} />;
  }
  if (typeof value === "string") {
    return <StringPropInput value={value} onChange={onChange} />;
  }
  if (value === null || value === undefined) {
    return <NullableStringInput onChange={onChange} />;
  }
  // Past the depth cap — fall back to JSON. Everything before this
  // renders structurally.
  if (depth > MAX_DEPTH) {
    return <JsonPropInput value={value} onChange={onChange} />;
  }
  if (Array.isArray(value)) {
    return <ArrayFields value={value} onChange={onChange} depth={depth} />;
  }
  if (typeof value === "object") {
    return (
      <ObjectFields
        value={value as Record<string, unknown>}
        onChange={onChange as (next: Record<string, unknown>) => void}
        depth={depth}
      />
    );
  }
  // Fallback for exotic types (bigint, symbol after JSON round-trip
  // shouldn't occur, but be defensive).
  return <JsonPropInput value={value} onChange={onChange} />;
}

function BooleanInput({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Toggle
      size="sm"
      variant="outline"
      pressed={value}
      onPressedChange={onChange}
      aria-label={value ? "true" : "false"}
      className="h-7 px-2 text-[11px] font-mono self-start min-w-16"
    >
      {value ? "true" : "false"}
    </Toggle>
  );
}

function StringPropInput({
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
  // Long strings (URLs, descriptions) get a textarea; short ones stay
  // single-line. Threshold picked so titles fit but multi-line copy
  // wraps.
  const multiline = value.length > 60 || value.includes("\n");
  if (multiline) {
    return (
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="px-2 py-1.5 text-[11px] font-mono resize-y [field-sizing:fixed] min-h-12"
        rows={Math.min(5, Math.ceil(value.length / 60) + 1)}
      />
    );
  }
  return (
    <Input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={INPUT_CLASS}
    />
  );
}

function NumberPropInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === "") return;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    if (n === value) return;
    onChange(n);
  };
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft(String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={INPUT_CLASS}
    />
  );
}

function NullableStringInput({
  onChange,
}: {
  onChange: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Input
      type="text"
      placeholder="null"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const next = e.target.value;
        onChange(next === "" ? null : next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          setDraft("");
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={INPUT_CLASS}
    />
  );
}

function JsonPropInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const initial = formatJson(value);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(formatJson(value));
    setError(null);
  }, [value]);

  const commit = (next: string) => {
    if (next === initial) {
      setError(null);
      return;
    }
    try {
      const parsed = JSON.parse(next);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="w-full flex flex-col gap-1">
      <Textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(initial);
            setError(null);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className="px-2 py-1.5 text-[11px] font-mono resize-y [field-sizing:fixed] min-h-16"
        rows={Math.min(8, draft.split("\n").length + 1)}
      />
      {error && (
        <span className="text-[10px] text-destructive font-mono">
          {error}
        </span>
      )}
    </div>
  );
}

function RawJsonFallback({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-amber-500 font-mono">
        props attribute is not valid JSON — editing as raw text
      </span>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          if (e.target.value !== initial) onCommit(e.target.value);
        }}
        className="px-2 py-1.5 text-[11px] font-mono resize-y [field-sizing:fixed] min-h-16"
        rows={4}
      />
    </div>
  );
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}
