export type JobStatus = "running" | "done" | "failed";

export type AgentKind = "claude" | "codex";

export const AGENT_KINDS: AgentKind[] = ["claude", "codex"];

export const DEFAULT_AGENT: AgentKind = "claude";

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
  /** Which underlying agent runs this job. Defaults to claude server-side. */
  agent?: AgentKind;
  /** Inline image attachments. The server writes each to a temp file under
   *  `.spidey-sense/uploads/<jobId>/` and references the resulting paths in
   *  the prompt so claude/codex can read them via their image-aware tools. */
  images?: ImageAttachment[];
}

export interface ImageAttachment {
  /** Filename hint, e.g. "screenshot.png" — only used to derive the saved
   *  filename + extension. Not trusted as a path. */
  name: string;
  mimeType: string;
  /** Raw base64 (no `data:...;base64,` prefix). */
  dataBase64: string;
}

export interface CreateJobResponse {
  jobId: string;
}

export type ServerEvent =
  | { type: "hello"; jobs: JobSnapshot[] }
  | { type: "job:created"; job: JobSnapshot }
  | { type: "job:status"; jobId: string; status: JobStatus; step?: string; error?: string }
  /** Sent in dev when the daemon detects a fresh build of the inject bundle.
   *  Browser-side handler reacts by reloading so the new code takes effect
   *  without a manual refresh. Production daemons don't watch — they emit
   *  this only when the bundle file actually changes after startup. */
  | { type: "bundle:changed" };

export interface JobSnapshot {
  jobId: string;
  status: JobStatus;
  step?: string;
  error?: string;
  createdAt: number;
  /** User-facing prompt. Sent so clients can render an in-flight job in the
   *  diff sidebar (which otherwise has no history bundle to load). */
  prompt?: string;
  /** Agent running this job. Used by the sidebar to show the right label
   *  on in-flight turns and to lock continuations to the correct agent. */
  agent?: AgentKind;
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
  /** Set only for claude jobs — used to resume the underlying claude session. */
  sessionId?: string;
  /** Which agent ran this job. Older bundles (pre-multi-agent) won't have this
   *  — treat missing as `claude` for backward compat. */
  agent?: AgentKind;
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
