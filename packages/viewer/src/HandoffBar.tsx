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

/**
 * Side-by-side, git-diff-style view of every recorded change. Mirrors the
 * grouping the prompt uses (component-scoped → tile-scoped → primitives)
 * so the user can visually verify what's about to be sent before the
 * handoff. Each entry renders the change kind, where it lives in the
 * tree (component name, classes, nearest text), and a red/green
 * before-after pair when the change has those values.
 */
function ChangesModal({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: ChangeSummary;
}) {
  const empty =
    summary.byComponent.length === 0 &&
    summary.byTile.length === 0 &&
    summary.primitives.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-3xl max-h-[80vh] !p-0 !gap-0 flex flex-col"
      >
        <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-[13px] font-medium">
            <GitCompare size={14} />
            Changes
            <span className="text-muted-foreground font-mono text-[11px] font-normal">
              ({summary.totalCount} change{summary.totalCount === 1 ? "" : "s"})
            </span>
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </Button>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
          {empty && (
            <div className="text-[12px] text-muted-foreground text-center py-8">
              No changes recorded yet.
            </div>
          )}

          {summary.byComponent.length > 0 && (
            <ChangesGroup title="Component-scoped edits">
              {summary.byComponent.map((c) => (
                <ComponentBlock key={c.componentName} scope={c} />
              ))}
            </ChangesGroup>
          )}

          {summary.byTile.length > 0 && (
            <ChangesGroup title="Tile-scoped edits">
              {summary.byTile.map((t) => (
                <TileBlock key={t.tileId} scope={t} />
              ))}
            </ChangesGroup>
          )}

          {summary.primitives.length > 0 && (
            <ChangesGroup title="User-drawn primitives">
              {summary.primitives.map((p, i) => (
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function ComponentBlock({ scope }: { scope: ComponentScope }) {
  return (
    <article className="border border-border rounded-md overflow-hidden bg-card">
      <header className="px-3 py-2 border-b border-border bg-muted/40 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {`<${scope.componentName}>`}
        </span>
        {scope.file && (
          <span
            className="font-mono text-[11px] text-muted-foreground truncate"
            title={scope.file}
          >
            {scope.file}
          </span>
        )}
        {scope.instanceCount > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground/80">
            propagates to {scope.instanceCount} instance
            {scope.instanceCount === 1 ? "" : "s"}
          </span>
        )}
      </header>
      <div className="flex flex-col">
        {scope.changes.map((c, i) => (
          <ChangeRow key={i} change={c} />
        ))}
      </div>
    </article>
  );
}

function TileBlock({ scope }: { scope: TileScope }) {
  return (
    <article className="border border-border rounded-md overflow-hidden bg-card">
      <header className="px-3 py-2 border-b border-border bg-muted/40 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {scope.tileLabel}
        </span>
        {scope.sourceHints.length > 0 && (
          <span
            className="font-mono text-[11px] text-muted-foreground truncate"
            title={scope.sourceHints.join(", ")}
          >
            {scope.sourceHints[0]}
            {scope.sourceHints.length > 1
              ? ` (+${scope.sourceHints.length - 1})`
              : ""}
          </span>
        )}
      </header>
      <div className="flex flex-col">
        {scope.changes.map((c, i) => (
          <ChangeRow key={i} change={c} />
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
    <article className="border border-border rounded-md overflow-hidden bg-card">
      <header className="px-3 py-2 border-b border-border bg-muted/40 flex items-center gap-2 flex-wrap">
        <KindBadge kind="insert" />
        <span className="font-mono text-[12px] text-foreground">
          {describeNodeShape(primitive.node)}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          on {primitive.tileLabel}
        </span>
      </header>
      <div className="px-3 py-2 text-[11px] text-muted-foreground font-mono">
        inserted under <Lineage lineage={primitive.insertedUnder} />
      </div>
    </article>
  );
}

function ChangeRow({ change }: { change: SquashedChange }) {
  return (
    <div className="px-3 py-2 border-t border-border first:border-t-0 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
        <KindBadge kind={change.kind} />
        <ChangeTitle change={change} />
        <Lineage lineage={change.lineage} className="ml-auto" />
      </div>
      <ChangeBody change={change} />
    </div>
  );
}

function ChangeTitle({ change }: { change: SquashedChange }) {
  switch (change.kind) {
    case "style":
      return (
        <span className="text-foreground">
          style.<span className="text-primary">{change.prop}</span>
        </span>
      );
    case "attr":
      return (
        <span className="text-foreground">
          attr <span className="text-primary">{change.name}</span>
        </span>
      );
    case "text":
      return <span className="text-foreground">text</span>;
    case "insert":
      return (
        <span className="text-foreground">
          insert {describeNodeShape(change.node)} at{" "}
          <span className="text-muted-foreground">
            {change.parentId}[{change.index}]
          </span>
        </span>
      );
    case "remove":
      return (
        <span className="text-foreground">
          remove <span className="text-muted-foreground">{change.nodeId}</span>
        </span>
      );
    case "move":
      return (
        <span className="text-foreground">
          move{" "}
          <span className="text-muted-foreground">
            → {change.newParentId}[{change.newIndex}]
          </span>
        </span>
      );
    case "duplicate":
      return (
        <span className="text-foreground">
          duplicate{" "}
          <span className="text-muted-foreground">{change.sourceNodeId}</span>
        </span>
      );
    case "paste":
      return (
        <span className="text-foreground">
          paste-as-child of{" "}
          <span className="text-muted-foreground">{change.parentId}</span>
        </span>
      );
  }
}

function ChangeBody({ change }: { change: SquashedChange }) {
  // style / attr / text → before/after pair. Structural changes don't
  // have a meaningful pair; the title row already says everything.
  if (change.kind === "style" || change.kind === "attr") {
    return <BeforeAfter before={change.before} after={change.after} />;
  }
  if (change.kind === "text") {
    return <BeforeAfter before={change.before} after={change.after} multiline />;
  }
  return null;
}

/** Two-row diff with `-` / `+` gutters, red/green tinted. Each side
 *  renders null/empty values as a muted placeholder so the absence is
 *  visually distinct from an empty string. */
function BeforeAfter({
  before,
  after,
  multiline,
}: {
  before: string | null;
  after: string | null;
  multiline?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border overflow-hidden font-mono text-[11px]">
      <DiffRow sign="-" value={before} multiline={multiline} />
      <DiffRow sign="+" value={after} multiline={multiline} />
    </div>
  );
}

function DiffRow({
  sign,
  value,
  multiline,
}: {
  sign: "-" | "+";
  value: string | null;
  multiline?: boolean;
}) {
  const isMinus = sign === "-";
  const cls = isMinus
    ? "bg-red-500/10 text-red-600 dark:text-red-400"
    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  const gutter = isMinus
    ? "text-red-500/70 dark:text-red-400/70"
    : "text-emerald-600/70 dark:text-emerald-400/70";
  const swatch = value ? extractColor(value) : null;
  return (
    <div className={`flex items-start gap-2 px-2 py-1 ${cls}`}>
      <span className={`shrink-0 select-none ${gutter}`}>{sign}</span>
      <span
        className={`flex-1 min-w-0 ${
          multiline ? "whitespace-pre-wrap break-words" : "break-all"
        }`}
      >
        {value === null ? (
          <span className="italic opacity-60">(unset)</span>
        ) : value === "" ? (
          <span className="italic opacity-60">(empty string)</span>
        ) : (
          value
        )}
      </span>
      {swatch && (
        <span
          className="shrink-0 size-3 rounded-sm border border-foreground/20 mt-0.5"
          style={{ background: swatch }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

const KIND_STYLES: Record<SquashedChange["kind"], string> = {
  style: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  attr: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  text: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  insert: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  remove: "bg-red-500/15 text-red-600 dark:text-red-400",
  move: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  duplicate: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  paste: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
};

function KindBadge({ kind }: { kind: SquashedChange["kind"] }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium uppercase tracking-wide ${KIND_STYLES[kind]}`}
    >
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
  if (lineage.textContext) bits.push(`"${truncate(lineage.textContext, 30)}"`);
  if (bits.length === 0) return null;
  return (
    <span
      className={`text-[10px] text-muted-foreground/80 font-mono truncate ${className ?? ""}`}
      title={bits.join(" / ")}
    >
      {bits.join(" / ")}
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
