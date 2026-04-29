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
  GitCompare,
  Search,
  Columns2,
  Rows2,
} from "lucide-react";
import { toast } from "sonner";
import {
  renderPrompt,
  summarize,
  type ChangeSummary,
  type ComponentScope,
  type NodeLineage,
  type SquashedChange,
  type TileScope,
} from "./editor/changeset";
import type { SpideyNode } from "@spidey/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Compute a token-level diff between two strings, returning spans with
 *  highlight flags. Uses character-level tokens for short values (≤80 chars
 *  combined) and word/boundary tokens for longer ones so the highlighted
 *  regions stay readable. Returns null when the strings are identical or the
 *  combined length is too large to diff cheaply. */
type DiffSpan = { text: string; highlight: boolean };

function computeDiff(
  before: string,
  after: string,
): { beforeSpans: DiffSpan[]; afterSpans: DiffSpan[] } | null {
  if (before === after) return null;
  const total = before.length + after.length;
  if (total > 600) return null;

  const tokenize = (s: string): string[] =>
    total <= 80 ? [...s] : (s.match(/\S+|\s+/g) ?? [...s]);

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

type DiffViewMode = "split" | "stacked";

function ChangesModal({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ChangeSummary;
}) {
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<SquashedChange["kind"]>>(
    () => new Set(),
  );
  const [viewMode, setViewMode] = useState<DiffViewMode>("split");

  // Reset transient UI state whenever the modal closes — opening fresh
  // shouldn't carry stale filters.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveKinds(new Set());
    }
  }, [open]);

  const kindCounts = useMemo(() => {
    const counts: Partial<Record<SquashedChange["kind"], number>> = {};
    const tally = (cs: SquashedChange[]) => {
      for (const c of cs) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    };
    summary.byComponent.forEach((c) => tally(c.changes));
    summary.byTile.forEach((t) => tally(t.changes));
    counts.insert = (counts.insert ?? 0) + summary.primitives.length;
    return counts;
  }, [summary]);

  const matchesFilters = (c: SquashedChange) => {
    if (activeKinds.size > 0 && !activeKinds.has(c.kind)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const haystacks: string[] = [c.kind];
    if (c.kind === "style") haystacks.push(c.prop, c.before ?? "", c.after ?? "");
    else if (c.kind === "attr") haystacks.push(c.name, c.before ?? "", c.after ?? "");
    else if (c.kind === "text") haystacks.push(c.before ?? "", c.after);
    else if (c.kind === "insert") haystacks.push(describeNodeShape(c.node));
    else if (c.kind === "remove") haystacks.push(c.nodeId);
    else if (c.kind === "move") haystacks.push(c.newParentId);
    else if (c.kind === "duplicate") haystacks.push(c.sourceNodeId);
    else if (c.kind === "paste") haystacks.push(c.parentId);
    if (c.lineage.componentName) haystacks.push(c.lineage.componentName);
    if (c.lineage.classChain) haystacks.push(...c.lineage.classChain);
    if (c.lineage.textContext) haystacks.push(c.lineage.textContext);
    return haystacks.some((s) => s.toLowerCase().includes(q));
  };

  const filteredComponents = useMemo(
    () =>
      summary.byComponent
        .map((c) => ({ ...c, changes: c.changes.filter(matchesFilters) }))
        .filter((c) => c.changes.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.byComponent, query, activeKinds],
  );
  const filteredTiles = useMemo(
    () =>
      summary.byTile
        .map((t) => ({ ...t, changes: t.changes.filter(matchesFilters) }))
        .filter((t) => t.changes.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary.byTile, query, activeKinds],
  );
  const filteredPrimitives = useMemo(() => {
    if (activeKinds.size > 0 && !activeKinds.has("insert")) return [];
    if (!query) return summary.primitives;
    const q = query.toLowerCase();
    return summary.primitives.filter((p) => {
      const bits: string[] = [
        describeNodeShape(p.node),
        p.tileLabel,
        p.insertedUnder.componentName ?? "",
        ...(p.insertedUnder.classChain ?? []),
      ];
      return bits.some((s) => s.toLowerCase().includes(q));
    });
  }, [summary.primitives, query, activeKinds]);

  const empty =
    summary.byComponent.length === 0 &&
    summary.byTile.length === 0 &&
    summary.primitives.length === 0;
  const noMatches =
    !empty &&
    filteredComponents.length === 0 &&
    filteredTiles.length === 0 &&
    filteredPrimitives.length === 0;

  const filteredCount =
    filteredComponents.reduce((n, c) => n + c.changes.length, 0) +
    filteredTiles.reduce((n, t) => n + t.changes.length, 0) +
    filteredPrimitives.length;
  const hasFilters = query.length > 0 || activeKinds.size > 0;

  const toggleKind = (kind: SquashedChange["kind"]) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-5xl max-h-[88vh] !p-0 !gap-0 flex flex-col"
      >
        <DialogHeader className="flex-col items-stretch gap-3 px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2.5 text-sm font-semibold">
              <GitCompare size={15} className="text-muted-foreground" />
              Changes
              <span className="bg-muted text-muted-foreground font-mono text-[11px] font-normal px-1.5 py-0.5 rounded-md tabular-nums">
                {hasFilters
                  ? `${filteredCount} / ${summary.totalCount}`
                  : summary.totalCount}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <div className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("split")}
                  title="Side-by-side diff"
                  className={`h-6 px-2 rounded-[5px] text-[11px] inline-flex items-center gap-1.5 transition-colors ${
                    viewMode === "split"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Columns2 size={12} />
                  Split
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("stacked")}
                  title="Stacked diff"
                  className={`h-6 px-2 rounded-[5px] text-[11px] inline-flex items-center gap-1.5 transition-colors ${
                    viewMode === "stacked"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Rows2 size={12} />
                  Stacked
                </button>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
              >
                <X />
              </Button>
            </div>
          </div>

          {!empty && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter changes by prop, value, or component…"
                  className="!h-7 pl-7 text-[12px]"
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {(Object.keys(KIND_STYLES) as SquashedChange["kind"][])
                  .filter((k) => (kindCounts[k] ?? 0) > 0)
                  .map((kind) => {
                    const count = kindCounts[kind] ?? 0;
                    const active = activeKinds.has(kind);
                    const s = KIND_STYLES[kind];
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => toggleKind(kind)}
                        className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] font-medium uppercase tracking-wide transition-colors border ${
                          active
                            ? `${s.bg} ${s.text} border-transparent ring-1 ring-current/20`
                            : "bg-transparent text-muted-foreground border-border hover:bg-muted/60"
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${s.dot} ${
                            active ? "opacity-100" : "opacity-50"
                          }`}
                        />
                        {kind}
                        <span className="font-mono text-[10px] tabular-nums opacity-70">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setActiveKinds(new Set());
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-1.5 h-6"
                  >
                    <X size={11} /> Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto bg-muted/20">
          {empty && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
                <GitCompare size={18} />
              </div>
              <div className="text-[13px] text-foreground/80">
                No changes recorded yet
              </div>
              <div className="text-[11px] text-muted-foreground/70 max-w-xs">
                Edit a tile or property — your changes show up here grouped by
                scope.
              </div>
            </div>
          )}

          {!empty && noMatches && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
              <Search size={18} className="text-muted-foreground/60" />
              <div className="text-[13px] text-foreground/80">
                No matches for current filters
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveKinds(new Set());
                }}
                className="text-[11px] text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}

          {filteredComponents.length > 0 && (
            <ChangesGroup
              title="Component-scoped edits"
              hint="propagates to all instances"
              count={filteredComponents.reduce(
                (n, c) => n + c.changes.length,
                0,
              )}
            >
              {filteredComponents.map((c) => (
                <ComponentBlock
                  key={c.componentName}
                  scope={c}
                  viewMode={viewMode}
                />
              ))}
            </ChangesGroup>
          )}

          {filteredTiles.length > 0 && (
            <ChangesGroup
              title="Tile-scoped edits"
              hint="local to a single tile"
              count={filteredTiles.reduce((n, t) => n + t.changes.length, 0)}
            >
              {filteredTiles.map((t) => (
                <TileBlock key={t.tileId} scope={t} viewMode={viewMode} />
              ))}
            </ChangesGroup>
          )}

          {filteredPrimitives.length > 0 && (
            <ChangesGroup
              title="User-drawn primitives"
              hint="newly inserted nodes"
              count={filteredPrimitives.length}
            >
              {filteredPrimitives.map((p, i) => (
                <PrimitiveBlock
                  key={`${p.tileId}::${p.node.id}::${i}`}
                  primitive={p}
                />
              ))}
            </ChangesGroup>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangesGroup({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="sticky top-0 z-10 px-5 py-2 bg-muted/95 backdrop-blur-sm border-b border-border/60 flex items-center gap-2">
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/70">
          {title}
        </h3>
        <span className="bg-background/80 text-muted-foreground font-mono text-[10px] px-1.5 py-0.5 rounded tabular-nums border border-border/60">
          {count}
        </span>
        {hint && (
          <span className="text-[10px] text-muted-foreground/60 italic">
            {hint}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">{children}</div>
    </section>
  );
}

function ComponentBlock({
  scope,
  viewMode,
}: {
  scope: ComponentScope;
  viewMode: DiffViewMode;
}) {
  return (
    <article className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
      <header className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-b from-muted/50 to-muted/30 border-b border-border">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="size-1.5 rounded-full bg-primary shrink-0" />
          <code className="text-[12px] font-mono font-semibold text-foreground shrink-0">
            &lt;{scope.componentName}&gt;
          </code>
          {scope.file && (
            <span
              className="text-[11px] font-mono text-muted-foreground/70 truncate"
              title={scope.file}
            >
              {scope.file}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground bg-background/70 border border-border px-2 py-0.5 rounded-full tabular-nums">
          {scope.changes.length} change{scope.changes.length === 1 ? "" : "s"}
        </span>
        {scope.instanceCount > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground bg-background/70 border border-border px-2 py-0.5 rounded-full tabular-nums">
            {scope.instanceCount} instance{scope.instanceCount === 1 ? "" : "s"}
          </span>
        )}
      </header>
      <div className="divide-y divide-border/60">
        {scope.changes.map((c, i) => (
          <ChangeRow key={i} change={c} viewMode={viewMode} />
        ))}
      </div>
    </article>
  );
}

function TileBlock({
  scope,
  viewMode,
}: {
  scope: TileScope;
  viewMode: DiffViewMode;
}) {
  return (
    <article className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
      <header className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-b from-muted/50 to-muted/30 border-b border-border">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="size-1.5 rounded-full bg-cyan-500 shrink-0" />
          <code className="text-[12px] font-mono font-semibold text-foreground shrink-0">
            {scope.tileLabel}
          </code>
          {scope.sourceHints.length > 0 && (
            <span
              className="text-[11px] font-mono text-muted-foreground/70 truncate"
              title={scope.sourceHints.join(", ")}
            >
              {scope.sourceHints[0]}
              {scope.sourceHints.length > 1
                ? ` +${scope.sourceHints.length - 1}`
                : ""}
            </span>
          )}
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground bg-background/70 border border-border px-2 py-0.5 rounded-full tabular-nums">
          {scope.changes.length} change{scope.changes.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="divide-y divide-border/60">
        {scope.changes.map((c, i) => (
          <ChangeRow key={i} change={c} viewMode={viewMode} />
        ))}
      </div>
    </article>
  );
}

function PrimitiveBlock({
  primitive,
}: {
  primitive: ChangeSummary["primitives"][number];
}) {
  return (
    <article className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
      <header className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-b from-muted/50 to-muted/30 border-b border-border">
        <KindBadge kind="insert" />
        <code className="text-[12px] font-mono text-foreground">
          {describeNodeShape(primitive.node)}
        </code>
        <span className="ml-auto text-[11px] text-muted-foreground/70">
          on <span className="font-mono">{primitive.tileLabel}</span>
        </span>
      </header>
      <div className="px-4 py-3 text-[11px] text-muted-foreground font-mono flex items-center gap-2 flex-wrap">
        <span className="text-muted-foreground/70">inserted under</span>
        <Lineage lineage={primitive.insertedUnder} />
      </div>
    </article>
  );
}

function ChangeRow({
  change,
  viewMode,
}: {
  change: SquashedChange;
  viewMode: DiffViewMode;
}) {
  return (
    <div className="px-4 py-3 flex flex-col gap-2 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <KindBadge kind={change.kind} />
        <span className="text-[12px] font-mono min-w-0">
          <ChangeTitle change={change} />
        </span>
        <Lineage lineage={change.lineage} className="ml-auto" />
      </div>
      <ChangeBody change={change} viewMode={viewMode} />
    </div>
  );
}

function ChangeTitle({ change }: { change: SquashedChange }) {
  switch (change.kind) {
    case "style":
      return (
        <span className="text-foreground/80">
          <span className="text-muted-foreground">style.</span>
          <span className="text-foreground font-semibold">{change.prop}</span>
        </span>
      );
    case "attr":
      return (
        <span className="text-foreground/80">
          <span className="text-muted-foreground">attr </span>
          <span className="text-foreground font-semibold">{change.name}</span>
        </span>
      );
    case "text":
      return <span className="text-foreground/80">text content</span>;
    case "insert":
      return (
        <span className="text-foreground/80">
          insert {describeNodeShape(change.node)}{" "}
          <span className="text-muted-foreground">
            → {change.parentId}[{change.index}]
          </span>
        </span>
      );
    case "remove":
      return (
        <span className="text-foreground/80">
          remove{" "}
          <span className="text-muted-foreground">{change.nodeId}</span>
        </span>
      );
    case "move":
      return (
        <span className="text-foreground/80">
          move{" "}
          <span className="text-muted-foreground">
            → {change.newParentId}[{change.newIndex}]
          </span>
        </span>
      );
    case "duplicate":
      return (
        <span className="text-foreground/80">
          duplicate{" "}
          <span className="text-muted-foreground">{change.sourceNodeId}</span>
        </span>
      );
    case "paste":
      return (
        <span className="text-foreground/80">
          paste into{" "}
          <span className="text-muted-foreground">{change.parentId}</span>
        </span>
      );
  }
}

function ChangeBody({
  change,
  viewMode,
}: {
  change: SquashedChange;
  viewMode: DiffViewMode;
}) {
  if (change.kind === "style" || change.kind === "attr") {
    return (
      <BeforeAfter
        before={change.before}
        after={change.after}
        viewMode={viewMode}
      />
    );
  }
  if (change.kind === "text") {
    return (
      <BeforeAfter
        before={change.before}
        after={change.after}
        viewMode={viewMode}
        multiline
      />
    );
  }
  return null;
}

function BeforeAfter({
  before,
  after,
  viewMode,
  multiline,
}: {
  before: string | null;
  after: string | null;
  viewMode: DiffViewMode;
  multiline?: boolean;
}) {
  const diff =
    !multiline && before !== null && after !== null
      ? computeDiff(before, after)
      : null;

  const beforeSwatch = before ? extractColor(before) : null;
  const afterSwatch = after ? extractColor(after) : null;

  if (viewMode === "split") {
    return (
      <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
        <DiffPane
          sign="-"
          label="Before"
          value={before}
          spans={diff?.beforeSpans}
          swatch={beforeSwatch}
          multiline={multiline}
        />
        <DiffPane
          sign="+"
          label="After"
          value={after}
          spans={diff?.afterSpans}
          swatch={afterSwatch}
          multiline={multiline}
        />
      </div>
    );
  }

  return (
    <div className="rounded-md overflow-hidden border border-border text-[11px] font-mono">
      <DiffRow
        sign="-"
        value={before}
        spans={diff?.beforeSpans}
        swatch={beforeSwatch}
        multiline={multiline}
      />
      <div className="border-t border-border/60" />
      <DiffRow
        sign="+"
        value={after}
        spans={diff?.afterSpans}
        swatch={afterSwatch}
        multiline={multiline}
      />
    </div>
  );
}

function diffSideStyles(sign: "-" | "+") {
  const isMinus = sign === "-";
  return {
    lineBg: isMinus
      ? "bg-red-500/[0.06] dark:bg-red-500/[0.1]"
      : "bg-emerald-500/[0.06] dark:bg-emerald-500/[0.1]",
    headerBg: isMinus
      ? "bg-red-500/[0.08] dark:bg-red-500/[0.14] border-red-200/60 dark:border-red-900/40"
      : "bg-emerald-500/[0.08] dark:bg-emerald-500/[0.14] border-emerald-200/60 dark:border-emerald-900/40",
    textCls: isMinus
      ? "text-red-700 dark:text-red-400"
      : "text-emerald-700 dark:text-emerald-400",
    gutterBg: isMinus
      ? "bg-red-500/[0.1] dark:bg-red-500/[0.15] border-r border-red-200/60 dark:border-red-900/40"
      : "bg-emerald-500/[0.1] dark:bg-emerald-500/[0.15] border-r border-emerald-200/60 dark:border-emerald-900/40",
    hlCls: isMinus
      ? "bg-red-400/30 dark:bg-red-500/35 rounded-[2px] px-[1px]"
      : "bg-emerald-400/30 dark:bg-emerald-500/35 rounded-[2px] px-[1px]",
    borderCls: isMinus
      ? "border-red-200/60 dark:border-red-900/40"
      : "border-emerald-200/60 dark:border-emerald-900/40",
  };
}

function DiffValue({
  value,
  spans,
  hlCls,
  multiline,
}: {
  value: string | null;
  spans?: DiffSpan[];
  hlCls: string;
  multiline?: boolean;
}) {
  if (value === null) return <span className="italic opacity-40">(unset)</span>;
  if (value === "") return <span className="italic opacity-40">(empty)</span>;
  if (spans)
    return (
      <>
        {spans.map((s, idx) =>
          s.highlight ? (
            <mark
              key={idx}
              className={`not-italic font-semibold text-inherit ${hlCls}`}
            >
              {s.text}
            </mark>
          ) : (
            <span key={idx}>{s.text}</span>
          ),
        )}
      </>
    );
  return (
    <span className={multiline ? "" : "break-all"}>{value}</span>
  );
}

function DiffPane({
  sign,
  label,
  value,
  spans,
  swatch,
  multiline,
}: {
  sign: "-" | "+";
  label: string;
  value: string | null;
  spans?: DiffSpan[];
  swatch: string | null;
  multiline?: boolean;
}) {
  const s = diffSideStyles(sign);
  return (
    <div className={`rounded-md overflow-hidden border ${s.borderCls}`}>
      <div
        className={`flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wide font-semibold border-b ${s.headerBg} ${s.textCls}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[11px] leading-none">{sign}</span>
          {label}
        </span>
        {swatch && (
          <span
            className="size-3 rounded border border-foreground/20"
            style={{ background: swatch }}
            aria-hidden="true"
          />
        )}
      </div>
      <div
        className={`px-3 py-1.5 leading-relaxed ${s.lineBg} ${s.textCls} ${
          multiline ? "whitespace-pre-wrap break-words" : "break-all"
        }`}
      >
        <DiffValue
          value={value}
          spans={spans}
          hlCls={s.hlCls}
          multiline={multiline}
        />
      </div>
    </div>
  );
}

function DiffRow({
  sign,
  value,
  spans,
  swatch,
  multiline,
}: {
  sign: "-" | "+";
  value: string | null;
  spans?: DiffSpan[];
  swatch: string | null;
  multiline?: boolean;
}) {
  const s = diffSideStyles(sign);

  return (
    <div className={`flex items-start ${s.lineBg} ${s.textCls}`}>
      <span
        className={`shrink-0 w-7 flex items-center justify-center py-1.5 text-[12px] select-none ${s.gutterBg}`}
      >
        {sign}
      </span>
      <span
        className={`flex-1 min-w-0 px-3 py-1.5 leading-relaxed ${
          multiline ? "whitespace-pre-wrap break-words" : "break-all"
        }`}
      >
        <DiffValue
          value={value}
          spans={spans}
          hlCls={s.hlCls}
          multiline={multiline}
        />
      </span>
      {swatch && (
        <span
          className="shrink-0 size-3.5 rounded border border-foreground/15 mt-2 mr-3"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

const KIND_STYLES: Record<
  SquashedChange["kind"],
  { bg: string; text: string; dot: string }
> = {
  style: {
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  attr: {
    bg: "bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
  },
  text: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  insert: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  remove: {
    bg: "bg-red-500/10",
    text: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
  move: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-600 dark:text-cyan-400",
    dot: "bg-cyan-500",
  },
  duplicate: {
    bg: "bg-pink-500/10",
    text: "text-pink-600 dark:text-pink-400",
    dot: "bg-pink-500",
  },
  paste: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-400",
    dot: "bg-indigo-500",
  },
};

function KindBadge({ kind }: { kind: SquashedChange["kind"] }) {
  const s = KIND_STYLES[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${s.bg} ${s.text}`}
    >
      <span className={`size-1.5 rounded-full ${s.dot} opacity-70`} />
      {kind}
    </span>
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
      className={`inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 max-w-[220px] truncate ${className ?? ""}`}
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
