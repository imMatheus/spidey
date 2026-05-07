import type {
  CreateJobRequest,
  CreateJobResponse,
  FileDiff,
  JobDiffBundle,
  JobThreadChangesResponse,
  JobThreadCommitResponse,
  JobThreadResponse,
  ServerEvent,
} from "../protocol";
import { animate as motionAnimate } from "motion";
import type { JobSocket } from "./socket";
import { renderDiff } from "./diff-render";
import { agentLabel } from "./agent";
import type { AgentKind } from "../protocol";
import {
  timeChipElement,
  writePersistedSidebar,
} from "./sidebar-utils";

/** Agent that ran the parent turn — continuations stay on the same agent so
 *  threads don't mix claude session resume with a fresh codex run. Older
 *  bundles predate the agent field; for those we use the presence of a
 *  sessionId as a hint (claude is the only agent that records one), otherwise
 *  fall back to claude. */
function bundleAgent(b: { agent?: AgentKind } | undefined): AgentKind {
  if (b?.agent === "codex" || b?.agent === "claude") return b.agent;
  return "claude";
}

/** True when we're confident the bundle is claude (explicit field or has a
 *  session id). Used to gate the "session metadata missing" warning so we
 *  don't show it for codex turns or for bundles whose agent we can't tell. */
function bundleIsClaude(b: { agent?: AgentKind; sessionId?: string } | undefined): boolean {
  if (!b) return false;
  if (b.agent === "claude") return true;
  if (b.agent === "codex") return false;
  return Boolean(b.sessionId);
}

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
  agent: AgentKind;
}

type CommitTerminal = "ready-to-push" | "pushed";

// Keyed by rootJobId so terminal state outlives sidebar hide/show, which
// always clears the SIDEBAR_STORAGE_KEY slot.
const COMMIT_TERMINAL_STORAGE_KEY = "spidey-grab:commit-terminal:v1";

function readCommitTerminalMap(): Record<string, CommitTerminal> {
  try {
    const raw = sessionStorage.getItem(COMMIT_TERMINAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CommitTerminal>) : {};
  } catch {
    return {};
  }
}

function writeCommitTerminal(rootJobId: string, value: CommitTerminal | null) {
  try {
    const map = readCommitTerminalMap();
    if (value === null) delete map[rootJobId];
    else map[rootJobId] = value;
    sessionStorage.setItem(COMMIT_TERMINAL_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readCommitTerminal(rootJobId: string): CommitTerminal | null {
  return readCommitTerminalMap()[rootJobId] ?? null;
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

  // tab state (persisted DOM so the indicator can animate between switches)
  private activeTab: "chat" | "changes" = "chat";
  private cachedChanges: JobThreadChangesResponse | null = null;
  private changesLoading = false;
  private tabsStripEl: HTMLDivElement | null = null;
  private tabsEl: HTMLDivElement | null = null;
  private indicatorEl: HTMLDivElement | null = null;
  private chatTabEl: HTMLDivElement | null = null;
  private changesTabEl: HTMLDivElement | null = null;
  private changesCountEl: HTMLSpanElement | null = null;
  private commitGroupEl: HTMLDivElement | null = null;
  private commitActionEl: HTMLButtonElement | null = null;
  private commitToggleEl: HTMLButtonElement | null = null;
  private commitMenuEl: HTMLDivElement | null = null;
  private commitMenuOpen = false;
  private commitMenuOutsideHandler: ((e: PointerEvent) => void) | null = null;
  private commitResetTimer: number | null = null;
  private committing = false;
  private commitMode: "commit" | "commit-push" = readCommitMode();
  // Once a commit has been made for this thread, the button progresses to a
  // terminal state and never reverts to plain "Commit". Persisted across hide/
  // show + page reloads via sessionStorage.
  private commitTerminal: CommitTerminal | null = null;

  constructor(opts: DiffSidebarOpts) {
    this.opts = opts;
    this.boundOutside = (e) => this.onOutsidePointerDown(e);
    this.boundKey = (e) => this.onKey(e);
  }

  async show(
    jobId: string,
    opts: { pending?: { jobId: string; prompt: string; agent?: AgentKind } } = {},
  ) {
    if (this.removeTimer != null) {
      clearTimeout(this.removeTimer);
      this.removeTimer = null;
    }
    const el = this.ensureElement();
    this.renderShell(el, "loading…");
    this.openInternal();

    let landed = false;
    try {
      const res = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(jobId)}/thread`);
      if (res.ok) {
        const body = (await res.json()) as JobThreadResponse;
        this.rootJobId = body.rootJobId;
        this.entries = body.entries;
        landed = true;
      } else if (res.status !== 404) {
        // fall back to the single-bundle endpoint for older daemon builds
        const r2 = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(jobId)}/diff`);
        if (r2.ok) {
          const single = (await r2.json()) as JobDiffBundle;
          this.rootJobId = single.jobId;
          this.entries = [single];
          landed = true;
        } else {
          this.renderError(el, `couldn't load history (${res.status})`);
          return;
        }
      } else {
        // 404 — try the diff endpoint too in case it serves something.
        const r2 = await fetch(`${this.opts.baseUrl}jobs/${encodeURIComponent(jobId)}/diff`);
        if (r2.ok) {
          const single = (await r2.json()) as JobDiffBundle;
          this.rootJobId = single.jobId;
          this.entries = [single];
          landed = true;
        }
      }
    } catch (err) {
      this.renderError(el, `couldn't reach daemon: ${(err as Error).message}`);
      return;
    }

    if (!landed) {
      // Job hasn't finalized yet — render in pending-only mode if we know
      // the prompt. The websocket finalize handler will re-fetch the thread
      // once the daemon writes its history bundle.
      if (!opts.pending) {
        this.renderError(el, "this job hasn't finished yet — try again once it's done");
        return;
      }
      this.rootJobId = jobId;
      this.entries = [];
    }

    this.pending = null;
    if (opts.pending && !this.entries.some((e) => e.jobId === opts.pending!.jobId)) {
      const inferredAgent: AgentKind =
        opts.pending.agent ??
        // For continuations whose pending was set by submitContinuation,
        // we lock to the parent's agent. For root pending opens (no prior
        // entries) without an explicit agent, fall back to claude.
        (this.entries.length > 0
          ? bundleAgent(this.entries[this.entries.length - 1])
          : "claude");
      this.pending = {
        jobId: opts.pending.jobId,
        prompt: opts.pending.prompt,
        status: "running",
        agent: inferredAgent,
      };
      // Hedge against the race where the job finalized between our first
      // fetch and our websocket subscription becoming live. If so, the
      // refresh will pull in the real bundle and clear `pending`.
      if (!landed) {
        setTimeout(() => {
          if (this.pending && this.pending.jobId === opts.pending!.jobId) {
            void this.refreshThread();
          }
        }, 250);
      }
    }
    // Recover terminal commit state if we're re-opening the same thread.
    this.commitTerminal = readCommitTerminal(this.rootJobId!);
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
        ? {
            jobId: this.pending.jobId,
            prompt: this.pending.prompt,
            agent: this.pending.agent,
          }
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
      this.tabsStripEl = null;
      this.tabsEl = null;
      this.indicatorEl = null;
      this.chatTabEl = null;
      this.changesTabEl = null;
      this.changesCountEl = null;
      this.commitGroupEl = null;
      this.commitActionEl = null;
      this.commitToggleEl = null;
      this.commitMenuEl = null;
      this.closeCommitMenu();
      if (this.commitResetTimer != null) {
        clearTimeout(this.commitResetTimer);
        this.commitResetTimer = null;
      }
      this.committing = false;
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
    this.el.appendChild(this.getOrBuildTabsStrip());
    this.updateChangesCount();

    if (this.activeTab === "chat") {
      const body = this.buildChatBody();
      this.el.appendChild(body);
      this.bodyEl = body;
      // Only show the composer when there's a real parent to continue from.
      // While a root job is still running we have a pending turn but no
      // bundle yet — `last` is undefined, and rendering the composer here
      // would default the placeholder to "claude" (the bundleAgent fallback)
      // even for codex threads. Wait for the bundle to land.
      if (last) this.el.appendChild(this.buildComposer(last));
      requestAnimationFrame(() => {
        if (this.bodyEl) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
        this.positionIndicator(false);
      });
    } else {
      const body = this.buildChangesBody();
      this.el.appendChild(body);
      this.bodyEl = body;
      requestAnimationFrame(() => this.positionIndicator(false));
      void this.ensureChangesLoaded();
    }
  }

  private getOrBuildTabsStrip(): HTMLDivElement {
    if (this.tabsStripEl) return this.tabsStripEl;

    const strip = document.createElement("div");
    strip.className = "diff-sidebar-tabs-strip";

    const tabs = document.createElement("div");
    tabs.className = "diff-sidebar-tabs";

    const indicator = document.createElement("div");
    indicator.className = "diff-sidebar-tab-indicator";
    tabs.appendChild(indicator);

    const chatTab = document.createElement("div");
    chatTab.className = `diff-sidebar-tab ${this.activeTab === "chat" ? "active" : ""}`.trim();
    chatTab.tabIndex = 0;
    chatTab.appendChild(iconSpan(CHAT_ICON_SVG));
    chatTab.appendChild(textSpan("Chat"));
    chatTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setTab("chat");
    });
    tabs.appendChild(chatTab);

    const changesTab = document.createElement("div");
    changesTab.className = `diff-sidebar-tab ${this.activeTab === "changes" ? "active" : ""}`.trim();
    changesTab.tabIndex = 0;
    changesTab.appendChild(iconSpan(CHANGES_ICON_SVG));
    changesTab.appendChild(textSpan("Changes"));
    const countSpan = document.createElement("span");
    countSpan.className = "tab-count";
    changesTab.appendChild(countSpan);
    changesTab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setTab("changes");
    });
    tabs.appendChild(changesTab);

    strip.appendChild(tabs);

    const group = document.createElement("div");
    group.className = "diff-sidebar-commit-group";

    const action = document.createElement("button");
    action.type = "button";
    action.className = "diff-sidebar-commit-action";
    action.appendChild(textSpan(commitModeLabel(this.commitMode)));
    action.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.commitThread();
    });
    group.appendChild(action);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "diff-sidebar-commit-toggle";
    toggle.title = "Choose commit action";
    toggle.innerHTML = COMMIT_CHEVRON_SVG;
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCommitMenu();
    });
    group.appendChild(toggle);

    const menu = document.createElement("div");
    menu.className = "diff-sidebar-commit-menu";
    menu.appendChild(this.buildCommitMenuItem("commit", "Commit"));
    menu.appendChild(this.buildCommitMenuItem("commit-push", "Commit & push"));
    group.appendChild(menu);

    strip.appendChild(group);
    this.commitGroupEl = group;
    this.commitActionEl = action;
    this.commitToggleEl = toggle;
    this.commitMenuEl = menu;
    this.refreshCommitModeUI();

    this.tabsStripEl = strip;
    this.tabsEl = tabs;
    this.indicatorEl = indicator;
    this.chatTabEl = chatTab;
    this.changesTabEl = changesTab;
    this.changesCountEl = countSpan;
    return strip;
  }

  private buildCommitMenuItem(mode: "commit" | "commit-push", label: string): HTMLButtonElement {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "diff-sidebar-commit-menu-item";
    if (this.commitMode === mode) item.classList.add("selected");
    item.dataset.mode = mode;
    item.appendChild(textSpan(label));
    const check = document.createElement("span");
    check.className = "check";
    check.innerHTML = COMMIT_CHECK_SVG;
    item.appendChild(check);
    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setCommitMode(mode);
      this.closeCommitMenu();
    });
    return item;
  }

  private setCommitMode(mode: "commit" | "commit-push") {
    if (this.commitMode === mode) return;
    this.commitMode = mode;
    writeCommitMode(mode);
    this.refreshCommitModeUI();
  }

  private refreshCommitModeUI() {
    if (this.commitTerminal) {
      this.applyCommitTerminalUI();
      return;
    }
    if (this.commitActionEl) {
      this.commitActionEl.disabled = false;
      this.commitActionEl.replaceChildren(textSpan(commitModeLabel(this.commitMode)));
      this.commitActionEl.title = commitModeTitle(this.commitMode);
    }
    if (this.commitToggleEl) this.commitToggleEl.disabled = false;
    if (this.commitMenuEl) {
      const items = this.commitMenuEl.querySelectorAll<HTMLElement>(".diff-sidebar-commit-menu-item");
      for (const item of Array.from(items)) {
        item.classList.toggle("selected", item.dataset.mode === this.commitMode);
      }
    }
  }

  private applyCommitTerminalUI() {
    if (!this.commitGroupEl || !this.commitActionEl || !this.commitToggleEl) return;
    this.commitGroupEl.classList.remove("committing", "failed");
    this.commitGroupEl.title = "";
    // mode toggle is irrelevant once a commit has been made
    this.commitToggleEl.disabled = true;

    if (this.commitTerminal === "pushed") {
      this.commitGroupEl.classList.add("success");
      this.commitActionEl.disabled = true;
      this.commitActionEl.title = "Already pushed";
      const iconWrap = buildCommitStatusIcon();
      const iconSvg = iconWrap.firstElementChild as SVGElement | null;
      iconSvg?.classList.add("done");
      const labelSpan = textSpan("Pushed");
      labelSpan.className = "commit-label";
      this.commitActionEl.replaceChildren(iconWrap, labelSpan);
    } else {
      this.commitGroupEl.classList.remove("success");
      this.commitActionEl.disabled = false;
      this.commitActionEl.title = "Push the commit to the remote";
      this.commitActionEl.replaceChildren(textSpan("Push commit"));
    }
  }

  private toggleCommitMenu() {
    if (this.commitMenuOpen) this.closeCommitMenu();
    else this.openCommitMenu();
  }

  private openCommitMenu() {
    if (this.commitMenuOpen || !this.commitGroupEl || !this.commitMenuEl) return;
    this.commitMenuOpen = true;
    this.commitGroupEl.classList.add("menu-open");
    requestAnimationFrame(() => {
      if (this.commitMenuOpen && this.commitMenuEl) this.commitMenuEl.classList.add("open");
    });
    const handler = (e: PointerEvent) => {
      if (!this.commitGroupEl) return;
      const path = e.composedPath();
      if (path.includes(this.commitGroupEl)) return;
      this.closeCommitMenu();
    };
    this.commitMenuOutsideHandler = handler;
    window.addEventListener("pointerdown", handler, true);
  }

  private closeCommitMenu() {
    if (!this.commitMenuOpen) return;
    this.commitMenuOpen = false;
    this.commitGroupEl?.classList.remove("menu-open");
    this.commitMenuEl?.classList.remove("open");
    if (this.commitMenuOutsideHandler) {
      window.removeEventListener("pointerdown", this.commitMenuOutsideHandler, true);
      this.commitMenuOutsideHandler = null;
    }
  }

  private async commitThread() {
    if (this.committing || !this.rootJobId || !this.commitGroupEl) return;
    if (this.commitTerminal === "pushed") return; // permanent terminal — nothing to do
    const group = this.commitGroupEl;
    const actionEl = this.commitActionEl;
    // From "ready-to-push" the action button does a push, regardless of the
    // chosen commit mode. Otherwise it follows the dropdown selection.
    const isPushOnly = this.commitTerminal === "ready-to-push";
    const shouldPush = isPushOnly || this.commitMode === "commit-push";
    if (this.commitResetTimer != null) {
      clearTimeout(this.commitResetTimer);
      this.commitResetTimer = null;
    }
    group.classList.remove("success", "failed");
    group.classList.add("committing");

    const loadingLabel = isPushOnly
      ? "Pushing…"
      : shouldPush
        ? "Committing & pushing…"
        : "Committing…";
    const iconWrap = buildCommitStatusIcon();
    const labelSpan = textSpan(loadingLabel);
    labelSpan.className = "commit-label";

    if (actionEl) {
      actionEl.disabled = true;
      actionEl.replaceChildren(iconWrap, labelSpan);
      motionAnimate(
        iconWrap,
        { opacity: [0, 1], scale: [0.4, 1] },
        { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
      );
    }
    if (this.commitToggleEl) this.commitToggleEl.disabled = true;
    this.committing = true;

    let nextTerminal: CommitTerminal | null = this.commitTerminal;
    try {
      const res = await fetch(
        `${this.opts.baseUrl}jobs/${encodeURIComponent(this.rootJobId)}/thread/commit`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ push: shouldPush }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as JobThreadCommitResponse;

      // The commit succeeds either by making a new commit (body.ok && body.sha)
      // or by being a no-op when the thread was already committed (body.nothingToCommit).
      const commitSucceeded = body.ok || body.nothingToCommit;
      let label = "";
      let cls: "success" | "failed" = "failed";

      if (commitSucceeded && shouldPush) {
        if (body.pushed) {
          cls = "success";
          label = "Pushed";
          nextTerminal = "pushed";
        } else {
          cls = "failed";
          label = "Push failed";
          nextTerminal = "ready-to-push";
          if (body.pushError && this.commitGroupEl) this.commitGroupEl.title = body.pushError;
        }
      } else if (commitSucceeded) {
        cls = "success";
        label = "Push commit";
        nextTerminal = "ready-to-push";
      } else {
        cls = "failed";
        label = body.error ? "Commit failed" : `Commit failed (${res.status})`;
        if (body.error && this.commitGroupEl) this.commitGroupEl.title = body.error;
      }

      group.classList.remove("committing");
      group.classList.add(cls);
      labelSpan.textContent = label;

      const iconSvg = iconWrap.firstElementChild as SVGElement | null;
      if (iconSvg) {
        if (cls === "success") {
          iconSvg.classList.add("done");
          motionAnimate(
            iconWrap,
            { scale: [1, 1.18, 1] },
            { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
          );
        } else {
          iconSvg.classList.add("failed");
          motionAnimate(
            iconWrap,
            { rotate: [0, -8, 8, -6, 6, 0] },
            { duration: 0.45, ease: "easeInOut" },
          );
        }
      }
    } catch (err) {
      group.classList.remove("committing");
      group.classList.add("failed");
      labelSpan.textContent = isPushOnly ? "Push failed" : "Commit failed";
      const iconSvg = iconWrap.firstElementChild as SVGElement | null;
      iconSvg?.classList.add("failed");
      if (this.commitGroupEl) this.commitGroupEl.title = (err as Error).message;
    } finally {
      this.committing = false;
      this.commitTerminal = nextTerminal;
      if (this.rootJobId) writeCommitTerminal(this.rootJobId, nextTerminal);

      if (this.commitTerminal === "pushed") {
        // permanent — keep success state, lock both buttons
        if (actionEl) actionEl.disabled = true;
        if (this.commitToggleEl) this.commitToggleEl.disabled = true;
      } else {
        if (actionEl) actionEl.disabled = false;
        if (this.commitToggleEl) this.commitToggleEl.disabled = this.commitTerminal != null;
        // After 3s, fade the celebratory icon and either revert to the mode
        // label (no terminal) or settle into the persistent terminal label.
        this.commitResetTimer = window.setTimeout(() => {
          if (this.commitGroupEl !== group) return;
          group.classList.remove("success", "failed");
          group.title = "";
          motionAnimate(
            iconWrap,
            { opacity: [1, 0], scale: [1, 0.4] },
            { duration: 0.18, ease: "easeIn" },
          ).finished.then(() => {
            if (this.commitGroupEl !== group) return;
            this.refreshCommitModeUI();
          });
          this.commitResetTimer = null;
        }, 3000);
      }
    }
  }

  private updateChangesCount() {
    if (!this.changesCountEl) return;
    const totalFiles =
      this.cachedChanges?.filesChanged
        ?? new Set(this.entries.flatMap((e) => e.diffs.map((d) => d.file))).size;
    this.changesCountEl.textContent = totalFiles > 0 ? String(totalFiles) : "";
    this.changesCountEl.style.display = totalFiles > 0 ? "" : "none";
  }

  private setTab(tab: "chat" | "changes") {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.chatTabEl?.classList.toggle("active", tab === "chat");
    this.changesTabEl?.classList.toggle("active", tab === "changes");
    this.positionIndicator(true);
    this.swapBody();
  }

  private positionIndicator(animate: boolean) {
    if (!this.indicatorEl || !this.tabsEl) return;
    const active = this.tabsEl.querySelector<HTMLElement>(".diff-sidebar-tab.active");
    if (!active) return;
    const containerRect = this.tabsEl.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (containerRect.width === 0 || activeRect.width === 0) return;
    const left = activeRect.left - containerRect.left;

    if (!animate) {
      const prev = this.indicatorEl.style.transition;
      this.indicatorEl.style.transition = "none";
      this.indicatorEl.style.transform = `translateX(${left}px)`;
      this.indicatorEl.style.width = `${activeRect.width}px`;
      void this.indicatorEl.offsetWidth;
      this.indicatorEl.style.transition = prev;
    } else {
      this.indicatorEl.style.transform = `translateX(${left}px)`;
      this.indicatorEl.style.width = `${activeRect.width}px`;
    }
  }

  private swapBody() {
    if (!this.el) return;
    const last = this.entries[this.entries.length - 1] ?? this.entries[0];
    // remove old body / composer
    this.el
      .querySelectorAll(".diff-sidebar-body, .diff-sidebar-composer")
      .forEach((n) => n.remove());

    if (this.activeTab === "chat") {
      const body = this.buildChatBody();
      this.el.appendChild(body);
      this.bodyEl = body;
      if (last) this.el.appendChild(this.buildComposer(last));
      requestAnimationFrame(() => {
        if (this.bodyEl) this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
      });
    } else {
      const body = this.buildChangesBody();
      this.el.appendChild(body);
      this.bodyEl = body;
      void this.ensureChangesLoaded();
    }
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
    this.updateChangesCount();
    if (this.activeTab === "changes") {
      this.swapBody();
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

    const agentChip = document.createElement("span");
    agentChip.className = "turn-agent";
    agentChip.textContent = agentLabel(bundleAgent(entry));
    meta.appendChild(agentChip);

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

    const agentChip = document.createElement("span");
    agentChip.className = "turn-agent";
    agentChip.textContent = agentLabel(pending.agent);
    meta.appendChild(agentChip);

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
    const agent = bundleAgent(last);
    const label = agentLabel(agent);
    // Only warn about missing session metadata when we know the parent is
    // claude — codex inlines prior turns server-side and bundles with no
    // agent field whose claude-ness we can't confirm shouldn't surface a
    // claude-specific caveat.
    const claudeWithoutSession = bundleIsClaude(last) && !last?.sessionId;
    ta.placeholder = claudeWithoutSession
      ? `follow-up (note: ${label} session metadata missing — prior context unavailable)`
      : `continue the conversation with ${label}…`;
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
      // Lock continuations to the parent's agent. Mixing agents inside one
      // thread would break claude's --resume hop and confuse codex's inline
      // context, so we stay on whichever agent started the thread.
      agent: bundleAgent(parent),
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
      this.pending = {
        jobId: body.jobId,
        prompt: value,
        status: "running",
        agent: bundleAgent(parent),
      };
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

function textSpan(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function iconSpan(svg: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "tab-icon";
  span.innerHTML = svg;
  return span;
}

const CHAT_ICON_SVG = `<svg viewBox="0 0 16 16" stroke-linejoin="round" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.75 0.189331L12.2803 0.719661L15.2803 3.71966L15.8107 4.24999L15.2803 4.78032L5.15901 14.9016C4.45575 15.6049 3.50192 16 2.50736 16H0.75H0V15.25V13.4926C0 12.4981 0.395088 11.5442 1.09835 10.841L11.2197 0.719661L11.75 0.189331ZM11.75 2.31065L9.81066 4.24999L11.75 6.18933L13.6893 4.24999L11.75 2.31065ZM2.15901 11.9016L8.75 5.31065L10.6893 7.24999L4.09835 13.841C3.67639 14.2629 3.1041 14.5 2.50736 14.5H1.5V13.4926C1.5 12.8959 1.73705 12.3236 2.15901 11.9016ZM9 16H16V14.5H9V16Z"/></svg>`;

const CHANGES_ICON_SVG = `<svg viewBox="0 0 16 16" stroke-linejoin="round" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.5 13.5V6.5V5.41421C14.5 5.149 14.3946 4.89464 14.2071 4.70711L9.79289 0.292893C9.60536 0.105357 9.351 0 9.08579 0H8H3H1.5V1.5V13.5C1.5 14.8807 2.61929 16 4 16H12C13.3807 16 14.5 14.8807 14.5 13.5ZM13 13.5V6.5H9.5H8V5V1.5H3V13.5C3 14.0523 3.44772 14.5 4 14.5H12C12.5523 14.5 13 14.0523 13 13.5ZM9.5 5V2.12132L12.3787 5H9.5ZM5.13 5.00062H4.505V6.25062H5.13H6H6.625V5.00062H6H5.13ZM4.505 8H5.13H11H11.625V9.25H11H5.13H4.505V8ZM5.13 11H4.505V12.25H5.13H11H11.625V11H11H5.13Z"/></svg>`;

const COMMIT_CHEVRON_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6L8 10.5L12.5 6"/></svg>`;

const COMMIT_CHECK_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5L6.5 12L13 4"/></svg>`;

const COMMIT_MODE_KEY = "spidey-grab:commit-mode:v1";

function readCommitMode(): "commit" | "commit-push" {
  try {
    const raw = localStorage.getItem(COMMIT_MODE_KEY);
    if (raw === "commit" || raw === "commit-push") return raw;
  } catch {
    // ignore
  }
  return "commit";
}

function writeCommitMode(mode: "commit" | "commit-push") {
  try {
    localStorage.setItem(COMMIT_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

function commitModeLabel(mode: "commit" | "commit-push"): string {
  return mode === "commit-push" ? "Commit & push" : "Commit";
}

function commitModeTitle(mode: "commit" | "commit-push"): string {
  return mode === "commit-push"
    ? "git commit the files in this thread, then push to the remote"
    : "git commit the files touched in this thread";
}

/** Builds a 14×14 status icon that starts as a spinning arc and morphs into a
 *  checkmark when the parent SVG gets the `.done` class. */
function buildCommitStatusIcon(): HTMLSpanElement {
  const wrap = document.createElement("span");
  wrap.className = "commit-icon-wrap";
  wrap.innerHTML = `<svg class="commit-status-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
  <circle class="ring-track" cx="8" cy="8" r="6" />
  <circle class="ring-arc" cx="8" cy="8" r="6" pathLength="100" stroke-dasharray="22 78" stroke-linecap="round" />
  <path class="check" d="M5 8.5 L7.2 10.7 L11.2 6.5" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" stroke-linecap="round" stroke-linejoin="round" />
  <path class="cross" d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" stroke-linecap="round" />
</svg>`;
  return wrap;
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

  block.appendChild(renderDiff(file.patch));
  return block;
}

