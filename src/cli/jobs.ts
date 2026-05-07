import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import type { AgentKind, JobSnapshot, JobStatus, ServerEvent } from "../protocol";

interface JobRecord extends JobSnapshot {
  child?: ChildProcess;
}

type Listener = (event: ServerEvent) => void;

const jobs = new Map<string, JobRecord>();
const listeners = new Set<Listener>();

function emit(event: ServerEvent) {
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      // ignore
    }
  }
}

function snapshot(rec: JobRecord): JobSnapshot {
  return {
    jobId: rec.jobId,
    status: rec.status,
    step: rec.step,
    error: rec.error,
    createdAt: rec.createdAt,
    prompt: rec.prompt,
    agent: rec.agent,
  };
}

export const jobStore = {
  create(opts: { prompt: string; agent: AgentKind }): JobRecord {
    const jobId = randomUUID();
    const rec: JobRecord = {
      jobId,
      status: "running",
      createdAt: Date.now(),
      prompt: opts.prompt,
      agent: opts.agent,
    };
    jobs.set(jobId, rec);
    emit({ type: "job:created", job: snapshot(rec) });
    return rec;
  },

  attachChild(jobId: string, child: ChildProcess) {
    const rec = jobs.get(jobId);
    if (rec) rec.child = child;
  },

  setStep(jobId: string, step: string) {
    const rec = jobs.get(jobId);
    if (!rec || rec.status !== "running") return;
    rec.step = step;
    emit({ type: "job:status", jobId, status: rec.status, step });
  },

  finish(jobId: string, status: JobStatus, error?: string) {
    const rec = jobs.get(jobId);
    if (!rec) return;
    rec.status = status;
    if (error) rec.error = error;
    emit({ type: "job:status", jobId, status, step: rec.step, error });
  },

  list(): JobSnapshot[] {
    return Array.from(jobs.values()).map(snapshot);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  cancelAll() {
    for (const rec of jobs.values()) {
      if (rec.child && !rec.child.killed) {
        rec.child.kill("SIGTERM");
      }
    }
  },
};
