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
import { renderPrompt, summarize, type ChangeSummary } from "./editor/changeset";
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
            <span className="px-2 text-[12px] font-mono text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={13} strokeWidth={2} className="text-primary" />
              {summary.totalCount} change{summary.totalCount === 1 ? "" : "s"}
            </span>
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
