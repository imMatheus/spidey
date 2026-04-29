import type {
  CreateJobRequest,
  CreateJobResponse,
  FileDiff,
  JobDiffBundle,
  JobThreadChangesResponse,
  JobThreadResponse,
  ServerEvent,
} from "../protocol";
import type { JobSocket } from "./socket";
import { renderDiff } from "./diff-render";

export interface DiffSidebarOpts {
  parent: HTMLElement;
  baseUrl: string;
  socket: JobSocket;
}

interface PendingTurn {
  jobId: string;
  prompt: string;
  step?: string;
  status: "running" | "failed";
  error?: string;
}

interface SidebarPersistedState {
  rootJobId: string;
  pending?: { jobId: string; prompt: string };
}

const SIDEBAR_STORAGE_KEY = "spidey-grab:sidebar:v1";

function readPersistedSidebar(): SidebarPersistedState | null {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SidebarPersistedState;
    if (!parsed || typeof parsed.rootJobId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePersistedSidebar(state: SidebarPersistedState | null) {
  try {
    if (state === null) sessionStorage.removeItem(SIDEBAR_STORAGE_KEY);
    else sessionStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function loadPersistedSidebar(): SidebarPersistedState | null {
  return readPersistedSidebar();
}

export class DiffSidebar {
  private opts: DiffSidebarOpts;
  private el: HTMLDivElement | null = null;
  private bodyEl: HTMLDivElement | null = null;
  private composerTextarea: HTMLTextAreaElement | null = null;
  private composerSubmit: HTMLButtonElement | null = null;
  private isOpen = false;
  private boundOutside: (e: PointerEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;
  private removeTimer: number | null = null;
  private unsubscribeSocket: (() => void) | null = null;

  // thread state
  private rootJobId: string | null = null;
  private entries: JobDiffBundle[] = [];
  private pending: PendingTurn | null = null;
  private submitting = false;

  // tab state
  private activeTab: "chat" | "changes" = "chat";
  private cachedChanges: JobThreadChangesResponse | null = null;
  private changesLoading = false;

  constructor(opts: DiffSidebarOpts) {
    this.opts = opts;
    this.boundOutside = (e) => this.onOutsidePointerDown(e);
    this.boundKey = (e) => this.onKey(e);
  }

  async show(jobId: string, opts: { pending?: { jobId: string; prompt: string } } = {}) {
    if (this.removeTimer != null) {
      clearTimeout(this.removeTimer);
      this.removeTimer = null;
    }
    const el = this.ensureElement();
    this.renderShell(el, "loading…");
    this.openInternal();

    try {
      const res = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(jobId)}/thread`);
      if (!res.ok) {
        // fall back to the single-bundle endpoint for older daemon builds
        const r2 = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(jobId)}/diff`);
        if (!r2.ok) {
          this.renderError(el, `couldn't load history (${res.status})`);
          return;
        }
        const single = (await r2.json()) as JobDiffBundle;
        this.rootJobId = single.jobId;
        this.entries = [single];
      } else {
        const body = (await res.json()) as JobThreadResponse;
        this.rootJobId = body.rootJobId;
        this.entries = body.entries;
      }
    } catch (err) {
      this.renderError(el, `couldn't reach daemon: ${(err as Error).message}`);
      return;
    }

    this.pending = null;
    if (opts.pending && !this.entries.some((e) => e.jobId === opts.pending!.jobId)) {
      this.pending = {
        jobId: opts.pending.jobId,
        prompt: opts.pending.prompt,
        status: "running",
      };
    }
    this.cachedChanges = null;
    this.persistState();
    this.renderSidebar();
  }

  private persistState() {
    if (!this.rootJobId) {
      writePersistedSidebar(null);
      return;
    }
    writePersistedSidebar({
      rootJobId: this.rootJobId,
      pending: this.pending
        ? { jobId: this.pending.jobId, prompt: this.pending.prompt }
        : undefined,
    });
  }

  hide() {
    if (!this.el || !this.isOpen) return;
    this.isOpen = false;
    const el = this.el;
    el.classList.remove("open");
    window.removeEventListener("pointerdown", this.boundOutside, true);
    window.removeEventListener("keydown", this.boundKey, true);
    if (this.unsubscribeSocket) {
      this.unsubscribeSocket();
      this.unsubscribeSocket = null;
    }
    if (this.removeTimer != null) clearTimeout(this.removeTimer);
    this.removeTimer = window.setTimeout(() => {
      el.remove();
      this.el = null;
      this.bodyEl = null;
      this.composerTextarea = null;
      this.composerSubmit = null;
      this.entries = [];
      this.pending = null;
      this.rootJobId = null;
      this.activeTab = "chat";
      this.cachedChanges = null;
      this.removeTimer = null;
    }, 320);
    writePersistedSidebar(null);
  }

  private ensureElement(): HTMLDivElement {
    if (this.el) return this.el;
    const el = document.createElement("div");
    el.className = "diff-sidebar";
    this.opts.parent.appendChild(el);
    this.el = el;
    return el;
  }

  private openInternal() {
    if (this.isOpen) return;
    this.isOpen = true;
    const el = this.el!;
    requestAnimationFrame(() => {
      if (this.el === el) el.classList.add("open");
    });
    window.addEventListener("pointerdown", this.boundOutside, true);
    window.addEventListener("keydown", this.boundKey, true);
    if (!this.unsubscribeSocket) {
      this.unsubscribeSocket = this.opts.socket.on((event) => this.onSocketEvent(event));
    }
  }

  private onSocketEvent(event: ServerEvent) {
    if (event.type !== "job:status") return;
    if (!this.pending || event.jobId !== this.pending.jobId) return;

    if (event.status === "running") {
      this.pending.step = event.step;
      this.updatePendingTurnUI();
      return;
    }
    if (event.status === "done") {
      // re-fetch the thread to pick up the new bundle
      void this.refreshThread();
      return;
    }
    if (event.status === "failed") {
      this.pending.status = "failed";
      this.pending.error = event.error;
      this.updatePendingTurnUI();
      void this.refreshThread();
    }
  }

  private async refreshThread() {
    if (!this.rootJobId) return;
    try {
      const res = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(this.rootJobId)}/thread`);
      if (!res.ok) return;
      const body = (await res.json()) as JobThreadResponse;
      this.entries = body.entries;
      // if the pending job has landed in entries, clear it
      if (this.pending && this.entries.some((e) => e.jobId === this.pending!.jobId)) {
        this.pending = null;
      }
      // thread updated → invalidate aggregated changes cache
      this.cachedChanges = null;
      this.persistState();
      this.renderSidebar();
    } catch {
      // ignore
    }
  }

  private onOutsidePointerDown(e: PointerEvent) {
    if (!this.el) return;
    const path = e.composedPath();
    if (path.includes(this.el)) return;
    for (const node of path) {
      if (node instanceof HTMLElement && node.classList?.contains("trigger-wrapper")) return;
    }
    this.hide();
  }

  private onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    // don't steal Escape from the composer textarea
    const target = e.target;
    if (target instanceof HTMLTextAreaElement && target === this.composerTextarea) return;
    e.preventDefault();
    e.stopPropagation();
    this.hide();
  }

  private renderShell(el: HTMLDivElement, prompt: string) {
    el.replaceChildren();
    el.appendChild(this.buildHeader(prompt, null));
    const body = document.createElement("div");
    body.className = "diff-sidebar-body loading";
    body.textContent = "loading…";
    el.appendChild(body);
    this.bodyEl = body;
  }

  private renderError(el: HTMLDivElement, msg: string) {
    el.replaceChildren();
    el.appendChild(this.buildHeader("error", null));
    const body = document.createElement("div");
    body.className = "diff-sidebar-body error";
    body.textContent = msg;
    el.appendChild(body);
    this.bodyEl = body;
  }

  private renderSidebar() {
    if (!this.el) return;
    const root = this.entries[0];
    const last = this.entries[this.entries.length - 1] ?? root;
    const headerPrompt = root?.prompt ?? "(no prompt)";
    const headerMeta = this.buildHeaderMetaEl();

    this.el.replaceChildren();
    this.el.appendChild(this.buildHeader(headerPrompt, headerMeta));
    this.el.appendChild(this.buildTabs());

    if (this.activeTab === "chat") {
      const body = this.buildChatBody();
      this.el.appendChild(body);
      this.bodyEl = body;
      this.el.appendChild(this.buildComposer(last));
      requestAnimationFrame(() => {
        if (this.bodyEl) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
      });
    } else {
      const body = this.buildChangesBody();
      this.el.appendChild(body);
      this.bodyEl = body;
      // no composer in changes view
      void this.ensureChangesLoaded();
    }
  }

  private buildTabs(): HTMLDivElement {
    const tabs = document.createElement("div");
    tabs.className = "diff-sidebar-tabs";

    const chatTab = document.createElement("div");
    chatTab.className = `diff-sidebar-tab ${this.activeTab === "chat" ? "active" : ""}`.trim();
    chatTab.textContent = "Chat";
    chatTab.tabIndex = 0;
    chatTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setTab("chat");
    });
    tabs.appendChild(chatTab);

    const changesTab = document.createElement("div");
    changesTab.className = `diff-sidebar-tab ${this.activeTab === "changes" ? "active" : ""}`.trim();
    const totalAdds = this.cachedChanges?.additions ?? this.entries.reduce((n, e) => n + e.additions, 0);
    const totalDels = this.cachedChanges?.deletions ?? this.entries.reduce((n, e) => n + e.deletions, 0);
    const totalFiles = this.cachedChanges?.filesChanged ?? new Set(this.entries.flatMap((e) => e.diffs.map((d) => d.file))).size;
    const fileSuffix = totalFiles > 0 ? ` · ${totalFiles}` : "";
    changesTab.innerHTML = `Changes<span class="tab-count">${fileSuffix}</span>`;
    changesTab.tabIndex = 0;
    changesTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setTab("changes");
    });
    tabs.appendChild(changesTab);

    void totalAdds;
    void totalDels;
    return tabs;
  }

  private setTab(tab: "chat" | "changes") {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.renderSidebar();
  }

  private buildChatBody(): HTMLDivElement {
    const body = document.createElement("div");
    body.className = "diff-sidebar-body";

    if (this.entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "diff-sidebar-empty";
      empty.textContent = "no history";
      body.appendChild(empty);
    } else {
      for (const entry of this.entries) {
        body.appendChild(this.renderTurn(entry));
      }
    }

    if (this.pending) {
      body.appendChild(this.renderPendingTurn(this.pending));
    }

    return body;
  }

  private buildChangesBody(): HTMLDivElement {
    const body = document.createElement("div");
    body.className = "diff-sidebar-body changes-body";

    if (!this.cachedChanges) {
      const loading = document.createElement("div");
      loading.className = "diff-sidebar-empty";
      loading.textContent = "computing changes…";
      body.appendChild(loading);
      return body;
    }

    const summary = document.createElement("div");
    summary.className = "changes-summary";
    if (this.cachedChanges.changes.length === 0) {
      summary.textContent = "no net changes in this thread";
      body.appendChild(summary);
      return body;
    }
    const filesText = `${this.cachedChanges.filesChanged} file${this.cachedChanges.filesChanged === 1 ? "" : "s"}`;
    summary.innerHTML = `<span>${filesText}</span><span class="counts"><span class="add">+${this.cachedChanges.additions}</span><span class="del">−${this.cachedChanges.deletions}</span></span>`;
    body.appendChild(summary);

    for (const file of this.cachedChanges.changes) {
      body.appendChild(renderFileBlock(file));
    }

    return body;
  }

  private async ensureChangesLoaded() {
    if (this.cachedChanges || this.changesLoading || !this.rootJobId) return;
    this.changesLoading = true;
    try {
      const res = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(this.rootJobId)}/thread/changes`);
      if (!res.ok) {
        this.changesLoading = false;
        return;
      }
      this.cachedChanges = (await res.json()) as JobThreadChangesResponse;
    } catch {
      // ignore
    } finally {
      this.changesLoading = false;
    }
    if (this.activeTab === "changes") {
      this.renderSidebar();
    }
  }

  private buildHeaderMetaEl(): HTMLDivElement | null {
    if (this.entries.length === 0) return null;
    const root = this.entries[0];

    const metaEl = document.createElement("div");
    metaEl.className = "diff-sidebar-meta";

    const segments: Node[] = [];
    if (root.target.source?.file) {
      const f = root.target.source.file.split("/").slice(-2).join("/");
      segments.push(document.createTextNode(root.target.source.line ? `${f}:${root.target.source.line}` : f));
    }
    segments.push(document.createTextNode(
      `${this.entries.length} turn${this.entries.length === 1 ? "" : "s"}`,
    ));
    const totalAdds = this.entries.reduce((n, e) => n + e.additions, 0);
    const totalDels = this.entries.reduce((n, e) => n + e.deletions, 0);
    if (totalAdds || totalDels) segments.push(document.createTextNode(`+${totalAdds} −${totalDels}`));
    segments.push(timeChipElement(root.createdAt));

    segments.forEach((seg, i) => {
      if (i > 0) metaEl.appendChild(document.createTextNode(" · "));
      metaEl.appendChild(seg);
    });
    return metaEl;
  }

  private buildHeader(prompt: string, metaEl: HTMLElement | null): HTMLDivElement {
    const header = document.createElement("div");
    header.className = "diff-sidebar-header";

    const close = document.createElement("button");
    close.className = "diff-sidebar-close";
    close.setAttribute("aria-label", "close");
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide();
    });
    header.appendChild(close);

    const promptEl = document.createElement("div");
    promptEl.className = "diff-sidebar-prompt";
    promptEl.textContent = prompt;
    header.appendChild(promptEl);

    if (metaEl) header.appendChild(metaEl);

    return header;
  }

  private renderTurn(entry: JobDiffBundle): HTMLDivElement {
    const turn = document.createElement("div");
    turn.className = "thread-turn";

    const head = document.createElement("div");
    head.className = "turn-head";
    const prompt = document.createElement("div");
    prompt.className = "turn-prompt";
    prompt.textContent = entry.prompt;
    head.appendChild(prompt);
    turn.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "turn-meta";

    const status = document.createElement("span");
    status.className = `turn-status ${entry.status}`;
    const dot = document.createElement("span");
    dot.className = "dot";
    status.appendChild(dot);
    const label = document.createElement("span");
    label.textContent = entry.status;
    status.appendChild(label);
    meta.appendChild(status);

    const counts = document.createElement("span");
    counts.textContent = `${entry.filesChanged} file${entry.filesChanged === 1 ? "" : "s"} · +${entry.additions} −${entry.deletions}`;
    meta.appendChild(counts);

    meta.appendChild(timeChipElement(entry.createdAt));

    turn.appendChild(meta);

    if (entry.status === "failed" && entry.error) {
      const err = document.createElement("div");
      err.className = "turn-error";
      err.textContent = entry.error;
      turn.appendChild(err);
    }

    if (entry.diffs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "turn-empty";
      empty.textContent = "no file changes recorded";
      turn.appendChild(empty);
    } else {
      const files = document.createElement("div");
      files.className = "turn-files";
      for (const file of entry.diffs) {
        files.appendChild(renderFileBlock(file));
      }
      turn.appendChild(files);
    }

    return turn;
  }

  private renderPendingTurn(pending: PendingTurn): HTMLDivElement {
    const turn = document.createElement("div");
    turn.className = "thread-turn pending";
    turn.dataset.jobId = pending.jobId;

    const head = document.createElement("div");
    head.className = "turn-head";
    const prompt = document.createElement("div");
    prompt.className = "turn-prompt";
    prompt.textContent = pending.prompt;
    head.appendChild(prompt);
    turn.appendChild(head);

    const meta = document.createElement("div");
    meta.className = "turn-meta";

    const status = document.createElement("span");
    status.className = `turn-status ${pending.status}`;
    const dot = document.createElement("span");
    dot.className = "dot";
    status.appendChild(dot);
    const label = document.createElement("span");
    label.className = "step-label";
    label.textContent = pending.status === "failed" ? "failed" : pending.step ?? "running";
    status.appendChild(label);
    meta.appendChild(status);

    turn.appendChild(meta);

    if (pending.status === "failed" && pending.error) {
      const err = document.createElement("div");
      err.className = "turn-error";
      err.textContent = pending.error;
      turn.appendChild(err);
    }

    return turn;
  }

  private updatePendingTurnUI() {
    if (!this.bodyEl || !this.pending) return;
    const node = this.bodyEl.querySelector<HTMLElement>(`.thread-turn.pending[data-job-id="${this.pending.jobId}"]`);
    if (!node) return;
    const status = node.querySelector<HTMLElement>(".turn-status");
    if (status) {
      status.classList.remove("running", "failed", "done");
      status.classList.add(this.pending.status);
      const lbl = status.querySelector<HTMLElement>(".step-label");
      if (lbl) lbl.textContent = this.pending.status === "failed" ? "failed" : this.pending.step ?? "running";
    }
    if (this.pending.status === "failed" && this.pending.error) {
      let errBlock = node.querySelector<HTMLElement>(".turn-error");
      if (!errBlock) {
        errBlock = document.createElement("div");
        errBlock.className = "turn-error";
        node.appendChild(errBlock);
      }
      errBlock.textContent = this.pending.error;
    }
  }

  private buildComposer(last: JobDiffBundle | undefined): HTMLDivElement {
    const composer = document.createElement("div");
    composer.className = "diff-sidebar-composer";

    const ta = document.createElement("textarea");
    ta.placeholder = last?.sessionId
      ? "continue the conversation…"
      : "follow-up (note: original session metadata missing — claude won't have prior context)";
    ta.rows = 3;
    composer.appendChild(ta);
    this.composerTextarea = ta;

    const row = document.createElement("div");
    row.className = "composer-row";

    const hint = document.createElement("span");
    hint.className = "composer-hint";
    hint.textContent = "enter to send · shift+enter newline";
    row.appendChild(hint);

    const submit = document.createElement("button");
    submit.textContent = "send";
    submit.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.submitContinuation(last);
    });
    row.appendChild(submit);
    this.composerSubmit = submit;

    composer.appendChild(row);

    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        void this.submitContinuation(last);
      }
    });

    return composer;
  }

  private async submitContinuation(parent: JobDiffBundle | undefined) {
    if (!this.composerTextarea || this.submitting) return;
    const value = this.composerTextarea.value.trim();
    if (!value) return;

    if (!parent) {
      // shouldn't happen — composer only renders when entries exist
      return;
    }

    this.submitting = true;
    if (this.composerSubmit) this.composerSubmit.disabled = true;

    const req: CreateJobRequest = {
      prompt: value,
      parentJobId: parent.jobId,
    };

    try {
      const res = await fetch(`${this.opts.baseUrl}jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        console.error("[spidey-grab] continuation failed", res.status, await res.text());
        return;
      }
      const body = (await res.json()) as CreateJobResponse;
      this.pending = { jobId: body.jobId, prompt: value, status: "running" };
      this.composerTextarea.value = "";
      this.persistState();
      this.renderSidebar();
    } catch (err) {
      console.error("[spidey-grab] continuation error", err);
    } finally {
      this.submitting = false;
      if (this.composerSubmit) this.composerSubmit.disabled = false;
      this.composerTextarea?.focus();
    }
  }
}

function renderFileBlock(file: FileDiff): HTMLDivElement {
  const block = document.createElement("div");
  block.className = "file-block";
  const head = document.createElement("div");
  head.className = "file-block-head";
  const path = document.createElement("span");
  path.className = "file-path";
  path.textContent = file.file;
  head.appendChild(path);
  const counts = document.createElement("span");
  counts.className = "file-counts";
  const tag = file.isNew ? "new" : file.isDeleted ? "deleted" : null;
  counts.innerHTML = `${tag ? `<span class="file-tag">${tag}</span>` : ""}<span class="add">+${file.additions}</span><span class="del">−${file.deletions}</span>`;
  head.appendChild(counts);
  block.appendChild(head);

  const pre = document.createElement("pre");
  pre.className = "diff-pre";
  pre.appendChild(renderDiff(file.patch));
  block.appendChild(pre);
  return block;
}

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 0) return "now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

const CLOCK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" stroke-linejoin="round" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.35066 2.06247C5.96369 1.78847 6.62701 1.60666 7.32351 1.53473L7.16943 0.0426636C6.31208 0.1312 5.49436 0.355227 4.73858 0.693033L5.35066 2.06247ZM8.67651 1.53473C11.9481 1.87258 14.5 4.63876 14.5 8.00001C14.5 11.5899 11.5899 14.5 8.00001 14.5C4.63901 14.5 1.87298 11.9485 1.5348 8.67722L0.0427551 8.83147C0.459163 12.8594 3.86234 16 8.00001 16C12.4183 16 16 12.4183 16 8.00001C16 3.86204 12.8589 0.458666 8.83059 0.0426636L8.67651 1.53473ZM2.73972 4.18084C3.14144 3.62861 3.62803 3.14195 4.18021 2.74018L3.29768 1.52727C2.61875 2.02128 2.02064 2.61945 1.52671 3.29845L2.73972 4.18084ZM1.5348 7.32279C1.60678 6.62656 1.78856 5.96348 2.06247 5.35066L0.693033 4.73858C0.355343 5.4941 0.131354 6.31152 0.0427551 7.16854L1.5348 7.32279ZM8.75001 4.75V4H7.25001V4.75V7.875C7.25001 8.18976 7.3982 8.48615 7.65001 8.675L9.55001 10.1L10.15 10.55L11.05 9.35L10.45 8.9L8.75001 7.625V4.75Z"/></svg>`;

export function timeChipHTML(ts: number): string {
  return `<span class="time-chip">${CLOCK_ICON_SVG}<span>${formatRelativeTime(ts)}</span></span>`;
}

export function timeChipElement(ts: number): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "time-chip";
  span.innerHTML = `${CLOCK_ICON_SVG}<span>${formatRelativeTime(ts)}</span>`;
  return span;
}
