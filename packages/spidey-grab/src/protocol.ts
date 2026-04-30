export type JobStatus = "running" | "done" | "failed";

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface ElementContext {
  tagName: string;
  classes: string[];
  textPreview: string;
  displayName: string | null;
}

export interface CreateJobRequest {
  prompt: string;
  source?: SourceLocation | null;
  context?: ElementContext;
  /** When set, the new job resumes the parent's claude session instead of starting fresh. */
  parentJobId?: string;
}

export interface CreateJobResponse {
  jobId: string;
}

export type ServerEvent =
  | { type: "hello"; jobs: JobSnapshot[] }
  | { type: "job:created"; job: JobSnapshot }
  | { type: "job:status"; jobId: string; status: JobStatus; step?: string; error?: string };

export interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  step?: string;
  error?: string;
  createdAt: number;
}

export interface JobTargetSummary {
  tagName: string;
  displayName: string | null;
  source: SourceLocation | null;
}

export interface JobHistorySummary {
  jobId: string;
  createdAt: number;
  completedAt?: number;
  status: JobStatus;
  promptPreview: string;
  target: JobTargetSummary;
  filesChanged: number;
  additions: number;
  deletions: number;
  error?: string;
  parentJobId?: string;
  sessionId?: string;
}

export interface FileDiff {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  isNew: boolean;
  isDeleted: boolean;
  /** Pre-job content. `null` means file did not exist. `undefined` if the bundle
   *  predates content-capture (older history files); cumulative aggregation
   *  falls back to the most recent turn's patch in that case. */
  before?: string | null;
  /** Post-job content. Same null/undefined semantics as `before`. */
  after?: string | null;
}

export interface JobDiffBundle extends JobHistorySummary {
  prompt: string;
  diffs: FileDiff[];
}

export interface JobHistoryListResponse {
  entries: JobHistorySummary[];
}

export interface JobThreadResponse {
  rootJobId: string;
  entries: JobDiffBundle[];
}

export interface JobThreadChangesResponse {
  rootJobId: string;
  changes: FileDiff[];
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface JobThreadCommitRequest {
  /** When true, run `git push` after the commit. Failures here surface in `pushError` but the commit itself still counts as ok. */
  push?: boolean;
}

export interface JobThreadCommitResponse {
  ok: boolean;
  sha?: string;
  filesCommitted?: string[];
  /** Set when no files were dirty in the working tree (i.e. changes were already committed or reverted). */
  nothingToCommit?: boolean;
  pushed?: boolean;
  pushError?: string;
  error?: string;
}
