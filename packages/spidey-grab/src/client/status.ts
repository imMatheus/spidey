import type { OverlayLayer } from "./overlay";
import type { ServerEvent, JobStatus } from "../protocol";
import type { Fingerprint } from "./refind";
import { findByFingerprint } from "./refind";
import { persistence } from "./persistence";

interface Tracked {
  outlineId: symbol;
  status: JobStatus;
  fingerprint: Fingerprint;
}

export class StatusManager {
  private overlay: OverlayLayer;
  private byJobId = new Map<string, Tracked>();

  constructor(overlay: OverlayLayer) {
    this.overlay = overlay;
  }

  track(jobId: string, target: Element, fingerprint: Fingerprint, opts: { persist: boolean }) {
    const refinder = () => findByFingerprint(fingerprint);
    const outlineId = this.overlay.attach(target, "running", {
      withBadge: true,
      refinder,
    });
    this.overlay.setBadgeText(outlineId, { spinner: true, step: "starting" });
    this.byJobId.set(jobId, { outlineId, status: "running", fingerprint });

    if (opts.persist) {
      persistence.add({ jobId, fingerprint, createdAt: Date.now() });
    }
  }

  hasJob(jobId: string): boolean {
    return this.byJobId.has(jobId);
  }

  async recover(persisted: { jobId: string; fingerprint: Fingerprint }, snapshot: { status: JobStatus; step?: string; error?: string }) {
    if (this.byJobId.has(persisted.jobId)) return;
    const target = await findByFingerprint(persisted.fingerprint);
    if (!target) {
      // can't relocate — drop persistence so we don't leak
      persistence.remove(persisted.jobId);
      return;
    }
    const refinder = () => findByFingerprint(persisted.fingerprint);
    const outlineId = this.overlay.attach(target, snapshot.status === "running" ? "running" : snapshot.status, {
      withBadge: true,
      refinder,
    });
    this.byJobId.set(persisted.jobId, {
      outlineId,
      status: snapshot.status,
      fingerprint: persisted.fingerprint,
    });
    this.applySnapshot(persisted.jobId, snapshot);
  }

  handleServerEvent(event: ServerEvent) {
    if (event.type === "hello") {
      // sync persistence with the daemon's view
      const known = new Set(event.jobs.map((j) => j.jobId));
      persistence.pruneExcept(known);
      return;
    }
    if (event.type === "job:created") {
      return;
    }
    if (event.type === "job:status") {
      this.applySnapshot(event.jobId, {
        status: event.status,
        step: event.step,
        error: event.error,
      });
    }
  }

  private applySnapshot(jobId: string, snapshot: { status: JobStatus; step?: string; error?: string }) {
    const tracked = this.byJobId.get(jobId);
    if (!tracked) return;
    tracked.status = snapshot.status;
    this.overlay.setState(tracked.outlineId, snapshot.status);

    if (snapshot.status === "running") {
      this.overlay.setBadgeText(tracked.outlineId, {
        spinner: true,
        step: snapshot.step ?? "working",
      });
      return;
    }

    if (snapshot.status === "done") {
      this.overlay.setBadgeText(tracked.outlineId, { icon: "✓", step: "done" });
      this.overlay.fadeAndRemove(tracked.outlineId, 4000);
      persistence.remove(jobId);
      setTimeout(() => this.byJobId.delete(jobId), 5000);
      return;
    }

    if (snapshot.status === "failed") {
      const reason = snapshot.error || "failed";
      this.overlay.setBadgeText(tracked.outlineId, {
        icon: "✕",
        step: shorten(reason, 60),
        tooltip: reason,
      });
      persistence.remove(jobId);
    }
  }
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
