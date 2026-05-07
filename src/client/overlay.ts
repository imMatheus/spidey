export type OutlineState = "hover" | "selected" | "running" | "done" | "failed";

export type Refinder = () => Promise<Element | null>;

interface SearchState {
  startedAt: number;
  inFlight: boolean;
  nextTimer: number | null;
}

export interface AnchoredElement {
  outline: HTMLDivElement;
  badge: HTMLDivElement | null;
  tagLabel: HTMLDivElement | null;
  target: Element;
  state: OutlineState;
  refinder?: Refinder;
  search?: SearchState;
}

const SEARCH_TIMEOUT_MS = 8000;
const SEARCH_INTERVAL_MS = 300;

export class OverlayLayer {
  private layer: HTMLDivElement;
  private anchored = new Map<symbol, AnchoredElement>();
  private hoverEntry: { id: symbol; entry: AnchoredElement } | null = null;
  private rafId: number | null = null;

  constructor(layer: HTMLDivElement) {
    this.layer = layer;
  }

  setHover(target: Element | null, label?: string) {
    if (!target) {
      if (this.hoverEntry) {
        this.removeEntry(this.hoverEntry.id);
        this.hoverEntry = null;
      }
      return;
    }
    if (this.hoverEntry && this.hoverEntry.entry.target === target) {
      if (label !== undefined && this.hoverEntry.entry.tagLabel) {
        this.hoverEntry.entry.tagLabel.textContent = label;
      }
      this.positionEntry(this.hoverEntry.entry);
      return;
    }
    if (this.hoverEntry) {
      this.removeEntry(this.hoverEntry.id);
      this.hoverEntry = null;
    }
    const id = Symbol("hover");
    const entry = this.createEntry(target, "hover", false, { tagLabel: label });
    this.anchored.set(id, entry);
    this.hoverEntry = { id, entry };
    this.positionEntry(entry);
    this.ensureRaf();
  }

  clearHover() {
    if (this.hoverEntry) {
      this.removeEntry(this.hoverEntry.id);
      this.hoverEntry = null;
    }
  }

  attach(
    target: Element,
    state: OutlineState,
    opts: { withBadge: boolean; refinder?: Refinder; onBadgeClick?: () => void },
  ): symbol {
    const id = Symbol("anchored");
    const entry = this.createEntry(target, state, opts.withBadge);
    if (opts.refinder) entry.refinder = opts.refinder;
    if (opts.onBadgeClick && entry.badge) {
      this.bindBadgeClick(entry.badge, opts.onBadgeClick);
    }
    this.anchored.set(id, entry);
    this.positionEntry(entry);
    this.ensureRaf();
    return id;
  }

  private bindBadgeClick(badge: HTMLDivElement, handler: () => void) {
    badge.classList.add("clickable");
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  retarget(id: symbol, target: Element) {
    const entry = this.anchored.get(id);
    if (!entry) return;
    entry.target = target;
    if (entry.search) {
      if (entry.search.nextTimer != null) clearTimeout(entry.search.nextTimer);
      entry.search = undefined;
    }
    this.positionEntry(entry);
  }

  updateRefinder(id: symbol, refinder: Refinder) {
    const entry = this.anchored.get(id);
    if (!entry) return;
    entry.refinder = refinder;
  }

  setAnimatingPosition(id: symbol, animating: boolean) {
    const entry = this.anchored.get(id);
    if (!entry) return;
    entry.outline.classList.toggle("animating-position", animating);
  }

  setState(id: symbol, state: OutlineState) {
    const entry = this.anchored.get(id);
    if (!entry) return;
    entry.state = state;
    entry.outline.className = `outline ${state}`;
    if (entry.badge) {
      entry.badge.classList.remove("running", "done", "failed");
      if (state === "running" || state === "done" || state === "failed") {
        entry.badge.classList.add(state);
      }
    }
  }

  setBadgeText(
    id: symbol,
    content: { step?: string; spinner?: boolean; icon?: string; tooltip?: string },
  ) {
    const entry = this.anchored.get(id);
    if (!entry || !entry.badge) return;
    const parts: string[] = [];
    if (content.spinner) parts.push('<div class="spinner"></div>');
    if (content.icon) parts.push(escapeHtml(content.icon));
    parts.push(`<div class="step">${escapeHtml(content.step ?? "")}</div>`);
    entry.badge.innerHTML = parts.join("");
    if (content.tooltip) {
      entry.badge.title = content.tooltip;
    } else {
      entry.badge.removeAttribute("title");
    }
  }

  fadeAndRemove(id: symbol, delayMs: number) {
    const entry = this.anchored.get(id);
    if (!entry) return;
    setTimeout(() => {
      const e = this.anchored.get(id);
      if (!e) return;
      e.outline.classList.add("fading");
      e.badge?.classList.add("fading");
      setTimeout(() => this.removeEntry(id), 450);
    }, delayMs);
  }

  remove(id: symbol) {
    this.removeEntry(id);
  }

  private createEntry(
    target: Element,
    state: OutlineState,
    withBadge: boolean,
    extras?: { tagLabel?: string },
  ): AnchoredElement {
    const outline = document.createElement("div");
    outline.className = `outline ${state}`;
    this.layer.appendChild(outline);

    let badge: HTMLDivElement | null = null;
    if (withBadge) {
      badge = document.createElement("div");
      badge.className = `badge ${state === "running" || state === "done" || state === "failed" ? state : ""}`.trim();
      this.layer.appendChild(badge);
    }

    let tagLabel: HTMLDivElement | null = null;
    if (extras?.tagLabel) {
      tagLabel = document.createElement("div");
      tagLabel.className = "tag-label";
      tagLabel.textContent = extras.tagLabel;
      this.layer.appendChild(tagLabel);
    }

    return { outline, badge, tagLabel, target, state };
  }

  private removeEntry(id: symbol) {
    const entry = this.anchored.get(id);
    if (!entry) return;
    if (entry.search?.nextTimer != null) clearTimeout(entry.search.nextTimer);
    entry.outline.remove();
    entry.badge?.remove();
    entry.tagLabel?.remove();
    this.anchored.delete(id);
  }

  private positionEntry(entry: AnchoredElement) {
    const rect = entry.target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      entry.outline.style.display = "none";
      if (entry.badge) entry.badge.style.display = "none";
      if (entry.tagLabel) entry.tagLabel.style.display = "none";
      return;
    }
    entry.outline.style.display = "";
    entry.outline.style.left = `${rect.left}px`;
    entry.outline.style.top = `${rect.top}px`;
    entry.outline.style.width = `${rect.width}px`;
    entry.outline.style.height = `${rect.height}px`;

    if (entry.badge) {
      entry.badge.style.display = "";
      const rightOffset = Math.max(8, window.innerWidth - rect.right);
      const top = Math.max(8, rect.top - 24);
      entry.badge.style.left = "auto";
      entry.badge.style.right = `${rightOffset}px`;
      entry.badge.style.top = `${top}px`;
      entry.badge.style.transform = "none";
    }

    if (entry.tagLabel) {
      entry.tagLabel.style.display = "";
      // sit flush above the outline's left edge; flip below if no room above
      const labelHeight = entry.tagLabel.offsetHeight || 18;
      let top = rect.top - labelHeight;
      if (top < 4) top = rect.top;
      entry.tagLabel.style.left = `${Math.max(0, rect.left)}px`;
      entry.tagLabel.style.top = `${top}px`;
    }
  }

  private ensureRaf() {
    if (this.rafId !== null) return;
    const tick = () => {
      this.rafId = null;
      if (this.anchored.size === 0) return;
      for (const [id, entry] of this.anchored.entries()) {
        if (!entry.target.isConnected) {
          this.handleDisconnected(id, entry);
          continue;
        }
        this.positionEntry(entry);
      }
      if (this.anchored.size > 0) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private handleDisconnected(id: symbol, entry: AnchoredElement) {
    // Hide the outline while the target is missing.
    entry.outline.style.display = "none";
    if (entry.badge) entry.badge.style.display = "none";

    if (!entry.refinder) return;

    if (!entry.search) {
      entry.search = { startedAt: Date.now(), inFlight: false, nextTimer: null };
      this.attemptRefind(id, entry);
      return;
    }

    if (Date.now() - entry.search.startedAt > SEARCH_TIMEOUT_MS) {
      this.removeEntry(id);
    }
  }

  private attemptRefind(id: symbol, entry: AnchoredElement) {
    if (!entry.refinder) return;
    if (entry.search?.inFlight) return;
    entry.search!.inFlight = true;
    entry
      .refinder()
      .then((found) => {
        const current = this.anchored.get(id);
        if (!current || !current.search) return;
        current.search.inFlight = false;
        if (found && found.isConnected) {
          this.retarget(id, found);
          return;
        }
        if (Date.now() - current.search.startedAt > SEARCH_TIMEOUT_MS) {
          this.removeEntry(id);
          return;
        }
        current.search.nextTimer = window.setTimeout(() => {
          const e = this.anchored.get(id);
          if (!e || !e.search) return;
          e.search.nextTimer = null;
          if (!e.target.isConnected) this.attemptRefind(id, e);
        }, SEARCH_INTERVAL_MS);
      })
      .catch(() => {
        const current = this.anchored.get(id);
        if (current?.search) current.search.inFlight = false;
      });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
