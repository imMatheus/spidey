import type { Fingerprint } from "./refind";

const KEY = "spidey-grab:active-jobs:v1";

export interface PersistedJob {
  jobId: string;
  fingerprint: Fingerprint;
  createdAt: number;
}

export const persistence = {
  load(): PersistedJob[] {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((j) => j && typeof j.jobId === "string");
    } catch {
      return [];
    }
  },

  add(job: PersistedJob) {
    const existing = persistence.load().filter((j) => j.jobId !== job.jobId);
    existing.push(job);
    persistence.write(existing);
  },

  remove(jobId: string) {
    const remaining = persistence.load().filter((j) => j.jobId !== jobId);
    persistence.write(remaining);
  },

  pruneExcept(jobIds: Set<string>) {
    const kept = persistence.load().filter((j) => jobIds.has(j.jobId));
    persistence.write(kept);
  },

  write(jobs: PersistedJob[]) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(jobs));
    } catch {
      // quota / disabled — ignore
    }
  },
};
