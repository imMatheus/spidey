import type { ResolvedTarget } from "./source";

export interface PromptBoxOpts {
  parent: HTMLElement;
  target: Element;
  resolved: ResolvedTarget;
  clickX?: number;
  clickY?: number;
  onSubmit: (prompt: string) => void;
  onCancel: () => void;
}

export class PromptBox {
  private el: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private opts: PromptBoxOpts;
  private rafId: number | null = null;
  private boundKey: (e: KeyboardEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private destroyed = false;
  private clickOffsetX: number | null = null;
  private clickOffsetY: number | null = null;

  constructor(opts: PromptBoxOpts) {
    this.opts = opts;
    if (opts.clickX !== undefined && opts.clickY !== undefined) {
      const rect = opts.target.getBoundingClientRect();
      this.clickOffsetX = opts.clickX - rect.left;
      this.clickOffsetY = opts.clickY - rect.top;
    }

    const el = document.createElement("div");
    el.className = "prompt-box";

    const meta = document.createElement("div");
    meta.className = "meta";
    const fileSpan = document.createElement("span");
    fileSpan.className = "file";
    fileSpan.textContent = formatLocation(opts.resolved);
    const tagSpan = document.createElement("span");
    tagSpan.textContent = `<${(opts.target.tagName || "").toLowerCase()}>`;
    meta.appendChild(fileSpan);
    meta.appendChild(tagSpan);
    el.appendChild(meta);

    const textarea = document.createElement("textarea");
    textarea.placeholder = "describe the change...";
    textarea.rows = 3;
    el.appendChild(textarea);
    this.textarea = textarea;

    const row = document.createElement("div");
    row.className = "row";
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "enter to send · shift+enter newline · esc cancel";
    const button = document.createElement("button");
    button.textContent = "send";
    button.addEventListener("click", () => this.submit());
    row.appendChild(hint);
    row.appendChild(button);
    el.appendChild(row);

    opts.parent.appendChild(el);
    this.el = el;

    this.boundKey = (e) => this.onKey(e);
    this.boundDown = (e) => this.onDocumentDown(e);

    textarea.addEventListener("keydown", this.boundKey);
    setTimeout(() => {
      textarea.focus();
      window.addEventListener("pointerdown", this.boundDown, true);
    }, 0);

    this.position();
    this.startTracking();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.textarea.removeEventListener("keydown", this.boundKey);
    window.removeEventListener("pointerdown", this.boundDown, true);
    this.el.remove();
  }

  private submit() {
    const value = this.textarea.value.trim();
    if (!value) return;
    this.opts.onSubmit(value);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onCancel();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      this.submit();
    }
  }

  private onDocumentDown(e: PointerEvent) {
    const path = e.composedPath();
    if (path.includes(this.el)) return;
    this.opts.onCancel();
  }

  private startTracking() {
    const tick = () => {
      this.rafId = null;
      if (this.destroyed) return;
      this.position();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private position() {
    const rect = this.opts.target.getBoundingClientRect();
    const boxWidth = this.el.offsetWidth || 360;
    const boxHeight = this.el.offsetHeight || 100;
    const margin = 8;

    // Anchor horizontally on the click point if we have one (centered on the
    // click, but kept inside the element's horizontal bounds where possible),
    // otherwise fall back to the element's left edge.
    let left: number;
    if (this.clickOffsetX !== null) {
      const anchorX = rect.left + this.clickOffsetX;
      left = anchorX - boxWidth / 2;
      // keep the box within the element's bounds horizontally if it fits
      if (boxWidth <= rect.width) {
        left = Math.max(rect.left, Math.min(left, rect.right - boxWidth));
      }
    } else {
      left = rect.left;
    }

    let top = rect.bottom + margin;

    if (left + boxWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - boxWidth - margin);
    }
    if (left < margin) left = margin;

    if (top + boxHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - boxHeight - margin);
    }

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }
}

function formatLocation(resolved: ResolvedTarget): string {
  if (resolved.source) {
    const file = resolved.source.file.split("/").slice(-2).join("/");
    return resolved.source.line ? `${file}:${resolved.source.line}` : file;
  }
  return resolved.context.displayName ? `<${resolved.context.displayName}>` : "(unknown source)";
}
