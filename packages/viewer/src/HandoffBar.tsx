import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Eye,
  Copy,
  X,
  Loader2,
  Check,
  AlertTriangle,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import {
  renderPrompt,
  summarize,
  type ChangeSummary,
  type NodeLineage,
  type SquashedChange,
} from "./editor/changeset";
import type { SpideyNode } from "@spidey/shared";
import { Button } from "@/components/ui/button";
import claudeIcon from "./assets/claude.png";
import codexIcon from "./assets/codex.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  useEditorDispatch,
  useEditorState,
  useProject,
  useReadyDoc,
} from "./context";

type AgentName = "claude" | "codex";

type JobStatus = {
  id: string;
  projectId: string;
  agent: AgentName;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  errorMessage?: string;
  logTail: string;
};

export function HandoffBar() {
  const editor = useEditorState();
  const dispatch = useEditorDispatch();
  const doc = useReadyDoc();
  const { activeProjectId, baselineMissing } = useProject();
  const onCleared = () => dispatch({ type: "clearChangeLog" });
  const summary = useMemo<ChangeSummary>(() => {
    return summarize(
      editor.changeLog,
      editor.baselineTrees,
      editor.tileTrees,
      editor.tilesMeta,
      doc,
      { baselineMissing },
    );
  }, [
    editor.changeLog,
    editor.baselineTrees,
    editor.tileTrees,
    editor.tilesMeta,
    doc,
    baselineMissing,
  ]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [job, setJob] = useState<JobStatus | null>(null);
  // Dedupe sonner toasts: each terminal status should fire exactly once even
  // though the polling effect can re-run on subsequent renders.
  const notifiedRef = useRef<string | null>(null);

  // Poll the active job every 1s while running. On a terminal status,
  // fire a sonner toast (deduped via notifiedRef so we never double-fire).
  useEffect(() => {
    if (!job || !activeProjectId || job.status !== "running") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(
          `/spidey-projects/${activeProjectId}/handoff/${job.id}`,
        );
        if (!r.ok) return;
        const next = (await r.json()) as JobStatus;
        if (cancelled) return;
        setJob(next);
        if (next.status === "done" && notifiedRef.current !== next.id) {
          notifiedRef.current = next.id;
          const agentLabel = next.agent === "claude" ? "Claude Code" : "Codex";
          toast.success(`${agentLabel} finished`, {
            description: "Run `spidey generate --force` to refresh the capture.",
            duration: 8000,
          });
          // Edits live in source now. Reset the gesture log so the badge
          // doesn't show stale changes; the doc reload after `generate`
          // will reset the baseline naturally.
          onCleared();
          setJob(null);
        } else if (next.status === "error" && notifiedRef.current !== next.id) {
          notifiedRef.current = next.id;
          const agentLabel = next.agent === "claude" ? "Claude Code" : "Codex";
          toast.error(`${agentLabel} failed`, {
            description: next.errorMessage ?? "agent reported an error",
            duration: 12000,
            action: {
              label: "View log",
              onClick: () => setLogOpen(true),
            },
          });
        }
      } catch {
        /* network blip — try next tick */
      }
    };
    const t = setInterval(tick, 1000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [job, activeProjectId, onCleared]);

  // On reload: ask if there's an active job to reattach to.
  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    fetch(`/spidey-projects/${activeProjectId}/handoff`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { active: JobStatus | null } | null) => {
        if (cancelled) return;
        if (data?.active && data.active.status === "running") setJob(data.active);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const prompt = useMemo(
    () => renderPrompt(summary, doc, "claude"),
    [summary, doc],
  );

  const send = async (agent: AgentName) => {
    if (!activeProjectId) return;
    const agentLabel = agent === "claude" ? "Claude Code" : "Codex";
    try {
      const r = await fetch(
        `/spidey-projects/${activeProjectId}/handoff`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agent, prompt: renderPrompt(summary, doc, agent) }),
        },
      );
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        toast.error(`Could not start ${agentLabel}`, {
          description: text || `HTTP ${r.status}`,
          duration: 12000,
        });
        return;
      }
      const data = (await r.json()) as { jobId: string };
      // optimistic running placeholder; the polling effect will replace it
      setJob({
        id: data.jobId,
        projectId: activeProjectId,
        agent,
        status: "running",
        startedAt: Date.now(),
        logTail: "",
      });
      setLogOpen(true);
    } catch (e: any) {
      toast.error(`Could not start ${agentLabel}`, {
        description: String(e?.message ?? e),
        duration: 12000,
      });
    }
  };

  const isRunning = job?.status === "running";

  // Hidden when there are no changes and no active job. (Sonner toasts
  // float independently — we don't gate visibility on them.)
  const hasAnything = summary.totalCount > 0 || isRunning;
  if (!hasAnything) return null;

  return (
    <>
      <div className="flex items-center gap-1 bg-card border border-border rounded-md p-1 shadow-lg">
        {summary.totalCount > 0 && !isRunning && (
          <>
            <button
              type="button"
              onClick={() => setChangesOpen(true)}
              title="Inspect all changes"
              className="px-2 h-7 text-[12px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-sm transition-colors"
            >
              <Sparkles size={13} strokeWidth={2} className="text-primary" />
              {summary.totalCount} change{summary.totalCount === 1 ? "" : "s"}
            </button>
            <Separator orientation="vertical" className="!h-5 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              title="Preview the prompt sent to the agent"
            >
              <Eye />
              Preview
            </Button>
            <Separator orientation="vertical" className="!h-5 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send("claude")}
              title="Spawn Claude Code with these changes"
            >
              <img
                src={claudeIcon}
                alt=""
                className="size-3.5 select-none pointer-events-none"
              />
              Send to Claude
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => send("codex")}
              title="Spawn Codex with these changes"
            >
              <img
                src={codexIcon}
                alt=""
                className="size-3.5 select-none pointer-events-none"
              />
              Send to Codex
            </Button>
          </>
        )}
        {isRunning && job && (
          <>
            <span className="px-2 text-[12px] font-mono text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin text-primary" />
              Running on {job.agent}…
            </span>
            <Separator orientation="vertical" className="!h-5 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLogOpen(true)}
            >
              <Terminal />
              View log
            </Button>
          </>
        )}
      </div>

      {baselineMissing && summary.totalCount === 0 && !isRunning && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground/70 bg-card border border-border rounded">
          No baseline — re-run <code>spidey generate</code> to enable handoff.
        </div>
      )}

      <ChangesModal
        open={changesOpen}
        onOpenChange={setChangesOpen}
        summary={summary}
      />

      <PromptModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        prompt={prompt}
        totalCount={summary.totalCount}
      />

      <LogModal open={logOpen} onOpenChange={setLogOpen} job={job} />
    </>
  );
}

function PromptModal({
  open,
  onOpenChange,
  prompt,
  totalCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  totalCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl max-h-[80vh] !p-0 !gap-0 flex flex-col"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-[13px] font-medium">
            <Send size={14} />
            Agent prompt preview
            <span className="text-muted-foreground font-mono text-[11px] font-normal">
              ({totalCount} change{totalCount === 1 ? "" : "s"})
            </span>
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? <Check className="text-emerald-500" /> : <Copy />}
              {copied ? "Copied" : "Copy prompt"}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>
        <pre
          ref={ref}
          className="flex-1 min-h-0 overflow-auto p-4 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre-wrap"
        >
          {prompt}
        </pre>
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground/70">
          Sending sends this prompt and your source files (read by the agent)
          to {`{Claude|Codex}`} via the agent's CLI.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogModal({
  open,
  onOpenChange,
  job,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobStatus | null;
}) {
  const ref = useRef<HTMLPreElement | null>(null);

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [job?.logTail]);

  if (!job) return null;

  let statusLabel: React.ReactNode;
  if (job.status === "running") {
    statusLabel = (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> running
      </span>
    );
  } else if (job.status === "done") {
    statusLabel = (
      <span className="inline-flex items-center gap-1.5 text-emerald-500">
        <Check size={12} /> done
      </span>
    );
  } else {
    statusLabel = (
      <span className="inline-flex items-center gap-1.5 text-destructive">
        <AlertTriangle size={12} /> error
        {job.exitCode != null ? ` (exit ${job.exitCode})` : ""}
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl max-h-[80vh] !p-0 !gap-0 flex flex-col"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-[13px] font-medium">
            <Terminal size={14} />
            {job.agent === "claude" ? "Claude Code" : "Codex"} log
            <span className="font-mono text-[11px] text-muted-foreground/70 font-normal">
              {job.id}
            </span>
            <span className="ml-2 text-[11px] font-normal">{statusLabel}</span>
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </Button>
        </DialogHeader>
        <pre
          ref={ref}
          className="flex-1 min-h-0 overflow-auto p-4 text-[11px] leading-relaxed font-mono text-foreground whitespace-pre-wrap bg-muted"
        >
          {job.logTail || "(no output yet)"}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

/** Word-level diff between two strings. Tokens are word runs, single
 *  punctuation chars, or whitespace runs — that gives readable highlights
 *  on CSS values like `rgba(255, 0, 0)` (only the changed numbers light up)
 *  without falling back to per-character noise. Returns null when strings
 *  are identical or too large to diff cheaply. */
type DiffSpan = { text: string; highlight: boolean };

function computeDiff(
  before: string,
  after: string,
): { beforeSpans: DiffSpan[]; afterSpans: DiffSpan[] } | null {
  if (before === after) return null;
  const total = before.length + after.length;
  if (total > 4000) return null;

  const tokenize = (s: string): string[] =>
    s.match(/[\w-]+|\s+|[^\w\s]/g) ?? [s];

  const ta = tokenize(before);
  const tb = tokenize(after);
  const m = ta.length;
  const n = tb.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        ta[i - 1] === tb[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: Array<{ op: "same" | "del" | "add"; text: string }> = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ta[i - 1] === tb[j - 1]) {
      ops.unshift({ op: "same", text: ta[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ op: "add", text: tb[j - 1] });
      j--;
    } else {
      ops.unshift({ op: "del", text: ta[i - 1] });
      i--;
    }
  }

  return {
    beforeSpans: ops
      .filter((o) => o.op !== "add")
      .map((o) => ({ text: o.text, highlight: o.op === "del" })),
    afterSpans: ops
      .filter((o) => o.op !== "del")
      .map((o) => ({ text: o.text, highlight: o.op === "add" })),
  };
}

/* ------------------------------------------------------------------ */
/*  Changes modal                                                     */
/* ------------------------------------------------------------------ */

type StyleChange = Extract<SquashedChange, { kind: "style" }>;

type Hunk =
  | {
      kind: "css-rule";
      id: string;
      nodeId: string;
      selector: string;
      lineage: NodeLineage;
      changes: StyleChange[];
    }
  | {
      kind: "single";
      id: string;
      change: SquashedChange;
    }
  | {
      kind: "primitive";
      id: string;
      node: SpideyNode;
      tileLabel: string;
      lineage: NodeLineage;
    };

type Scope = {
  id: string;
  category: "component" | "tile" | "primitive";
  /** Path-style title shown in the rail and section header. */
  title: string;
  /** Subtitle (file path / source hint). */
  subtitle?: string;
  /** Extra source-hint count after the first. */
  extraSources?: number;
  /** Total raw change count (un-grouped). */
  rawCount: number;
  /** Hunks for the right pane (css-rules grouped, structurals as singles). */
  hunks: Hunk[];
  /** Optional instance count badge for component scopes. */
  instanceCount?: number;
};

function buildHunks(changes: SquashedChange[], idPrefix: string): Hunk[] {
  // Group `style` changes by nodeId so a node with several edited properties
  // surfaces as one CSS rule. Everything else stays as its own hunk in
  // original order.
  const styleBuckets = new Map<string, StyleChange[]>();
  const order: Array<{ kind: "rule"; nodeId: string } | { kind: "single"; index: number }> = [];

  changes.forEach((c, idx) => {
    if (c.kind === "style") {
      const existing = styleBuckets.get(c.nodeId);
      if (existing) {
        existing.push(c);
      } else {
        styleBuckets.set(c.nodeId, [c]);
        order.push({ kind: "rule", nodeId: c.nodeId });
      }
    } else {
      order.push({ kind: "single", index: idx });
    }
  });

  return order.map((o, i) => {
    if (o.kind === "rule") {
      const bucket = styleBuckets.get(o.nodeId)!;
      return {
        kind: "css-rule" as const,
        id: `${idPrefix}:rule:${o.nodeId}:${i}`,
        nodeId: o.nodeId,
        selector: pickSelector(bucket[0].lineage),
        lineage: bucket[0].lineage,
        changes: bucket,
      };
    }
    const c = changes[o.index];
    return {
      kind: "single" as const,
      id: `${idPrefix}:single:${i}`,
      change: c,
    };
  });
}

function pickSelector(l: NodeLineage): string {
  if (l.classChain && l.classChain.length > 0) {
    return "." + l.classChain.slice(0, 3).join(".");
  }
  if (l.componentName) return `<${l.componentName}>`;
  return "node";
}

function buildScopes(summary: ChangeSummary): Scope[] {
  const out: Scope[] = [];

  for (const c of summary.byComponent) {
    out.push({
      id: `c:${c.componentName}`,
      category: "component",
      title: `<${c.componentName}>`,
      subtitle: c.file,
      rawCount: c.changes.length,
      hunks: buildHunks(c.changes, `c:${c.componentName}`),
      instanceCount: c.instanceCount,
    });
  }
  for (const t of summary.byTile) {
    out.push({
      id: `t:${t.tileId}`,
      category: "tile",
      title: t.tileLabel,
      subtitle: t.sourceHints[0],
      extraSources:
        t.sourceHints.length > 1 ? t.sourceHints.length - 1 : undefined,
      rawCount: t.changes.length,
      hunks: buildHunks(t.changes, `t:${t.tileId}`),
    });
  }
  summary.primitives.forEach((p, i) => {
    out.push({
      id: `p:${p.tileId}:${p.node.id}:${i}`,
      category: "primitive",
      title: describeNodeShape(p.node),
      subtitle: `inserted on ${p.tileLabel}`,
      rawCount: 1,
      hunks: [
        {
          kind: "primitive",
          id: `p:${p.tileId}:${p.node.id}:${i}:hunk`,
          node: p.node,
          tileLabel: p.tileLabel,
          lineage: p.insertedUnder,
        },
      ],
    });
  });

  return out;
}

function ChangesModal({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ChangeSummary;
}) {
  const scopes = useMemo(() => buildScopes(summary), [summary]);
  const empty = scopes.length === 0;

  const [activeId, setActiveId] = useState<string>("all");
  useEffect(() => {
    if (!open) setActiveId("all");
  }, [open]);

  const componentScopes = scopes.filter((s) => s.category === "component");
  const tileScopes = scopes.filter((s) => s.category === "tile");
  const primitiveScopes = scopes.filter((s) => s.category === "primitive");

  // Hold one element ref per scope section + the scrollable right pane, so
  // rail clicks can scrollIntoView on the matching section without affecting
  // what's rendered.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerSection = (id: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(id, el);
    else sectionRefs.current.delete(id);
  };

  // Scrollspy: as the user scrolls, mark whichever section's header is at
  // the top of the viewport as the active rail item. We pick the section
  // whose top is closest to (but ≤) the scroll container's top.
  useEffect(() => {
    if (!open || empty) return;
    const root = scrollRef.current;
    if (!root) return;

    const update = () => {
      const rootTop = root.getBoundingClientRect().top;
      let bestId: string = scopes[0]?.id ?? "all";
      let bestDelta = -Infinity;
      for (const scope of scopes) {
        const el = sectionRefs.current.get(scope.id);
        if (!el) continue;
        const delta = el.getBoundingClientRect().top - rootTop;
        // Section starts at or above the viewport top — prefer the closest.
        if (delta <= 4 && delta > bestDelta) {
          bestDelta = delta;
          bestId = scope.id;
        }
      }
      // Near the top? Mark "all" instead, so the pinned header item stays
      // active when nothing has been scrolled past.
      if (root.scrollTop < 8) bestId = "all";
      setActiveId((prev) => (prev === bestId ? prev : bestId));
    };

    update();
    root.addEventListener("scroll", update, { passive: true });
    return () => root.removeEventListener("scroll", update);
  }, [open, empty, scopes]);

  const handleSelect = (id: string) => {
    setActiveId(id);
    if (id === "all") {
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = sectionRefs.current.get(id);
    if (!el || !scrollRef.current) return;
    const rootTop = scrollRef.current.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollTop + (elTop - rootTop),
      behavior: "smooth",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="!max-w-[1100px] sm:!max-w-[1100px] !w-[min(95vw,1100px)] h-[82vh] !max-h-[82vh] !p-0 !gap-0 flex flex-col bg-card overflow-hidden"
      >
        <DialogHeader className="flex-row items-center justify-between px-5 h-12 border-b border-border shrink-0 gap-4">
          <DialogTitle className="flex items-baseline gap-2.5 text-[13px] font-medium">
            <span>Changes</span>
            <span className="text-muted-foreground/70 tabular-nums font-normal">
              {summary.totalCount}
            </span>
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            className="-mr-2"
          >
            <X />
          </Button>
        </DialogHeader>

        {empty ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center">
            <div className="text-[13px] text-foreground/80">
              No changes yet
            </div>
            <div className="text-[11px] text-muted-foreground/70 max-w-[220px]">
              Edit a tile or property — your changes appear here.
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            <Rail
              totalCount={summary.totalCount}
              activeId={activeId}
              onSelect={handleSelect}
              componentScopes={componentScopes}
              tileScopes={tileScopes}
              primitiveScopes={primitiveScopes}
            />
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
              {scopes.map((scope) => (
                <ScopeSection
                  key={scope.id}
                  scope={scope}
                  sectionRef={registerSection(scope.id)}
                />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Rail({
  totalCount,
  activeId,
  onSelect,
  componentScopes,
  tileScopes,
  primitiveScopes,
}: {
  totalCount: number;
  activeId: string;
  onSelect: (id: string) => void;
  componentScopes: Scope[];
  tileScopes: Scope[];
  primitiveScopes: Scope[];
}) {
  return (
    <aside className="w-[244px] shrink-0 border-r border-border overflow-y-auto bg-muted/20">
      <RailItem
        active={activeId === "all"}
        onClick={() => onSelect("all")}
        label="All changes"
        count={totalCount}
        sansFont
      />
      {componentScopes.length > 0 && (
        <RailGroup label="Components">
          {componentScopes.map((s) => (
            <RailItem
              key={s.id}
              active={activeId === s.id}
              onClick={() => onSelect(s.id)}
              label={s.title}
              subtitle={s.subtitle}
              count={s.rawCount}
            />
          ))}
        </RailGroup>
      )}
      {tileScopes.length > 0 && (
        <RailGroup label="Tiles">
          {tileScopes.map((s) => (
            <RailItem
              key={s.id}
              active={activeId === s.id}
              onClick={() => onSelect(s.id)}
              label={s.title}
              subtitle={s.subtitle}
              count={s.rawCount}
            />
          ))}
        </RailGroup>
      )}
      {primitiveScopes.length > 0 && (
        <RailGroup label="Primitives">
          {primitiveScopes.map((s) => (
            <RailItem
              key={s.id}
              active={activeId === s.id}
              onClick={() => onSelect(s.id)}
              label={s.title}
              subtitle={s.subtitle}
              count={s.rawCount}
            />
          ))}
        </RailGroup>
      )}
    </aside>
  );
}

function RailGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-3">
      <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function RailItem({
  active,
  onClick,
  label,
  subtitle,
  count,
  sansFont,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  subtitle?: string;
  count: number;
  sansFont?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12px] transition-colors ${
        active
          ? "bg-foreground/[0.06] text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
      }`}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-0">
        <span
          className={`truncate ${sansFont ? "" : "font-mono"} ${
            active ? "" : "group-hover:text-foreground"
          }`}
        >
          {label}
        </span>
        {subtitle && (
          <span
            className="truncate text-[10px] text-muted-foreground/55 font-mono"
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </div>
      <span
        className={`shrink-0 text-[10px] tabular-nums ${
          active ? "text-foreground/70" : "text-muted-foreground/55"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ScopeSection({
  scope,
  sectionRef,
}: {
  scope: Scope;
  sectionRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      ref={sectionRef}
      className="border-b border-border last:border-b-0 scroll-mt-0"
    >
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="px-6 py-3 flex items-center gap-3 min-w-0">
          <code className="text-[12px] font-mono font-medium text-foreground truncate">
            {scope.title}
          </code>
          {scope.subtitle && (
            <span
              className="text-[11px] text-muted-foreground/70 font-mono truncate"
              title={scope.subtitle}
            >
              {scope.subtitle}
              {scope.extraSources ? ` +${scope.extraSources}` : ""}
            </span>
          )}
          <span className="ml-auto shrink-0 inline-flex items-center gap-3 text-[11px] text-muted-foreground/60 tabular-nums">
            {scope.instanceCount != null && scope.instanceCount > 0 && (
              <span>
                {scope.instanceCount} instance
                {scope.instanceCount === 1 ? "" : "s"}
              </span>
            )}
            <span>
              {scope.rawCount} change{scope.rawCount === 1 ? "" : "s"}
            </span>
          </span>
        </div>
      </header>
      <div className="px-6 py-5 flex flex-col gap-5">
        {scope.hunks.map((h) => (
          <HunkBlock key={h.id} hunk={h} />
        ))}
      </div>
    </section>
  );
}

function HunkBlock({ hunk }: { hunk: Hunk }) {
  if (hunk.kind === "css-rule") return <CssRuleHunk hunk={hunk} />;
  if (hunk.kind === "primitive") return <PrimitiveHunk hunk={hunk} />;
  return <SingleHunk change={hunk.change} />;
}

function PrimitiveHunk({
  hunk,
}: {
  hunk: Extract<Hunk, { kind: "primitive" }>;
}) {
  return (
    <div>
      <HunkLabel
        badge="INSERT"
        title={describeNodeShape(hunk.node)}
        lineage={hunk.lineage}
      />
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[12px] font-mono text-foreground/80">
        <span className="text-muted-foreground">inserted on</span>{" "}
        {hunk.tileLabel}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hunk renderers                                                    */
/* ------------------------------------------------------------------ */

function HunkLabel({
  badge,
  title,
  lineage,
}: {
  badge: string;
  title?: React.ReactNode;
  lineage?: NodeLineage;
}) {
  return (
    <div className="flex items-center gap-2 mb-1.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
        {badge}
      </span>
      {title && (
        <span className="text-[11px] font-mono text-foreground/80 truncate">
          {title}
        </span>
      )}
      {lineage && <Lineage lineage={lineage} className="ml-auto" />}
    </div>
  );
}

type Side = "before" | "after";

const HL_BEFORE =
  "bg-rose-500/15 dark:bg-rose-400/20 text-rose-700 dark:text-rose-300 rounded-[3px] px-0.5";
const HL_AFTER =
  "bg-emerald-500/15 dark:bg-emerald-400/20 text-emerald-700 dark:text-emerald-300 rounded-[3px] px-0.5";

/** Two equal columns separated by a single border. No row-level fills —
 *  changed tokens highlight inline only. */
function SplitContainer({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden font-mono text-[12px] leading-[1.6] grid grid-cols-2">
      <div className="px-3 py-2 border-r border-border min-w-0 overflow-x-auto">
        {left}
      </div>
      <div className="px-3 py-2 min-w-0 overflow-x-auto">{right}</div>
    </div>
  );
}

/** Renders all style edits on one node as a paired CSS-rule block,
 *  side-by-side. Each property line shows its before value on the left and
 *  after value on the right; changed tokens are word-highlighted inline. */
function CssRuleHunk({
  hunk,
}: {
  hunk: Extract<Hunk, { kind: "css-rule" }>;
}) {
  return (
    <div>
      <HunkLabel badge="CSS" title={hunk.selector} lineage={hunk.lineage} />
      <SplitContainer
        left={
          <CssRuleSide
            selector={hunk.selector}
            side="before"
            changes={hunk.changes}
          />
        }
        right={
          <CssRuleSide
            selector={hunk.selector}
            side="after"
            changes={hunk.changes}
          />
        }
      />
    </div>
  );
}

function CssRuleSide({
  selector,
  side,
  changes,
}: {
  selector: string;
  side: Side;
  changes: StyleChange[];
}) {
  return (
    <div className="text-foreground/90">
      <div>
        <span className="text-foreground">{selector}</span>{" "}
        <span className="text-muted-foreground/70">{`{`}</span>
      </div>
      {changes.map((c) => {
        const value = side === "before" ? c.before : c.after;
        const swatch = value ? extractColor(value) : null;
        return (
          <div key={c.prop} className="pl-4 flex items-center gap-2 min-w-0">
            <span className="min-w-0 break-all">
              <span className="text-muted-foreground">{c.prop}</span>
              <span className="text-muted-foreground/60">: </span>
              <DiffValue before={c.before} after={c.after} side={side} />
              <span className="text-muted-foreground/50">;</span>
            </span>
            {swatch && (
              <span
                className="shrink-0 size-3 rounded-[3px] border border-foreground/15"
                style={{ background: swatch }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
      <div className="text-muted-foreground/70">{`}`}</div>
    </div>
  );
}

/** Single-row diff for one value (attr / text / structural change). */
function SingleHunk({ change }: { change: SquashedChange }) {
  if (change.kind === "attr") {
    return (
      <div>
        <HunkLabel
          badge="ATTR"
          title={
            <>
              <span className="text-muted-foreground">[</span>
              {change.name}
              <span className="text-muted-foreground">]</span>
            </>
          }
          lineage={change.lineage}
        />
        <ValueSplit before={change.before} after={change.after} />
      </div>
    );
  }
  if (change.kind === "text") {
    return (
      <div>
        <HunkLabel badge="TEXT" lineage={change.lineage} />
        <ValueSplit before={change.before} after={change.after} multiline />
      </div>
    );
  }
  // Structural change — no value diff, just a single descriptive row.
  return (
    <div>
      <HunkLabel
        badge={change.kind.toUpperCase()}
        lineage={change.lineage}
      />
      <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[12px] font-mono text-foreground/80">
        <StructuralDescription change={change} />
      </div>
    </div>
  );
}

function StructuralDescription({ change }: { change: SquashedChange }) {
  switch (change.kind) {
    case "insert":
      return (
        <>
          <span className="text-muted-foreground">insert</span>{" "}
          {describeNodeShape(change.node)}{" "}
          <span className="text-muted-foreground">
            into {change.parentId}[{change.index}]
          </span>
        </>
      );
    case "remove":
      return (
        <>
          <span className="text-muted-foreground">remove</span> {change.nodeId}
        </>
      );
    case "move":
      return (
        <>
          <span className="text-muted-foreground">move</span> {change.nodeId}{" "}
          <span className="text-muted-foreground">→</span>{" "}
          {change.newParentId}[{change.newIndex}]
        </>
      );
    case "duplicate":
      return (
        <>
          <span className="text-muted-foreground">duplicate</span>{" "}
          {change.sourceNodeId}
        </>
      );
    case "paste":
      return (
        <>
          <span className="text-muted-foreground">paste into</span>{" "}
          {change.parentId}
        </>
      );
    default:
      return null;
  }
}

function ValueSplit({
  before,
  after,
  multiline,
}: {
  before: string | null;
  after: string | null;
  multiline?: boolean;
}) {
  const beforeSwatch = before ? extractColor(before) : null;
  const afterSwatch = after ? extractColor(after) : null;
  return (
    <SplitContainer
      left={
        <ValueLine
          before={before}
          after={after}
          side="before"
          swatch={beforeSwatch}
          multiline={multiline}
        />
      }
      right={
        <ValueLine
          before={before}
          after={after}
          side="after"
          swatch={afterSwatch}
          multiline={multiline}
        />
      }
    />
  );
}

function ValueLine({
  before,
  after,
  side,
  swatch,
  multiline,
}: {
  before: string | null;
  after: string | null;
  side: Side;
  swatch: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span
        className={`flex-1 min-w-0 ${
          multiline ? "whitespace-pre-wrap break-words" : "break-all"
        } text-foreground/90`}
      >
        <DiffValue before={before} after={after} side={side} />
      </span>
      {swatch && (
        <span
          className="shrink-0 size-3 rounded-[3px] border border-foreground/15 mt-1"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** Renders the value for one side of a diff with word-level inline
 *  highlights on the changed tokens. Tokens that match the other side stay
 *  in normal foreground; only the diffing words light up. */
function DiffValue({
  before,
  after,
  side,
}: {
  before: string | null;
  after: string | null;
  side: Side;
}) {
  const value = side === "before" ? before : after;
  if (value === null) {
    return <span className="italic text-muted-foreground/60">unset</span>;
  }
  if (value === "") {
    return <span className="italic text-muted-foreground/60">empty</span>;
  }
  // No counterpart on the other side → highlight the whole value (it's
  // either a brand-new value or a deleted one).
  const counterpart = side === "before" ? after : before;
  if (counterpart === null || counterpart === "") {
    return (
      <mark
        className={`not-italic ${side === "before" ? HL_BEFORE : HL_AFTER}`}
      >
        {value}
      </mark>
    );
  }
  const diff = computeDiff(before!, after!);
  if (!diff) return <>{value}</>;
  const spans = side === "before" ? diff.beforeSpans : diff.afterSpans;
  const hl = side === "before" ? HL_BEFORE : HL_AFTER;
  return (
    <>
      {spans.map((s, idx) =>
        s.highlight ? (
          <mark key={idx} className={`not-italic ${hl}`}>
            {s.text}
          </mark>
        ) : (
          <span key={idx}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Lineage({
  lineage,
  className,
}: {
  lineage: NodeLineage;
  className?: string;
}) {
  const bits: string[] = [];
  if (lineage.componentName) bits.push(`<${lineage.componentName}>`);
  if (lineage.classChain && lineage.classChain.length > 0) {
    bits.push(`.${lineage.classChain.slice(0, 3).join(".")}`);
  }
  if (lineage.textContext) bits.push(`"${truncate(lineage.textContext, 24)}"`);
  if (bits.length === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/55 max-w-[260px] truncate ${className ?? ""}`}
      title={bits.join(" › ")}
    >
      {bits.map((b, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="opacity-40">›</span>}
          {b}
        </span>
      ))}
    </span>
  );
}

function describeNodeShape(node: SpideyNode): string {
  if (node.kind === "text") {
    const v = node.value.trim();
    return `text "${truncate(v, 40)}"`;
  }
  const cls = node.attrs.class
    ? `.${node.attrs.class.replace(/\s+/g, ".")}`
    : "";
  return `<${node.tag}${cls}>`;
}

/** Heuristic: pull the first CSS color out of a style value. Backs the
 *  swatch chip in the diff rows — covers rgb/rgba/hsl/hsla/#hex/named.
 *  Returns null when no color is recognized so callers can skip. */
function extractColor(value: string): string | null {
  if (!value) return null;
  const re =
    /(#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|\b(?:transparent|currentColor|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|cyan|magenta)\b)/i;
  const m = value.match(re);
  return m ? m[0] : null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
