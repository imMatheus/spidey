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
  source: SourceLocation | null;
  context: ElementContext;
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
