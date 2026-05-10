import type { ResolvedTarget } from "./source";
import {
  AttachmentsController,
  bindClipboardAndDrop,
} from "./attachments";
import type { ImageAttachment } from "../protocol";

export interface PromptBoxOpts {
  parent: HTMLElement;
  target: Element;
  resolved: ResolvedTarget;
  clickX?: number;
  clickY?: number;
  onSubmit: (
    prompt: string,
    target: Element,
    resolved: ResolvedTarget,
    images: ImageAttachment[],
  ) => void;
  onCancel: () => void;
  onNavigate?: (
    current: Element,
    direction: "up" | "down" | "left" | "right",
  ) => Promise<{ target: Element; resolved: ResolvedTarget } | null>;
}

const POSITION_ANIM_MS = 280;

export class PromptBox {
  private el: HTMLDivElement;
  private textarea: HTMLTextAreaElement;
  private fileSpan: HTMLSpanElement;
  private tagSpan: HTMLSpanElement;
  private opts: PromptBoxOpts;
  private rafId: number | null = null;
  private boundKey: (e: KeyboardEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private destroyed = false;
  private attachments: AttachmentsController;

  private currentTarget: Element;
  private currentResolved: ResolvedTarget;
  private clickOffsetX: number | null = null;
  private clickOffsetY: number | null = null;
  private animationTimer: number | null = null;
  private navigating = false;

  constructor(opts: PromptBoxOpts) {
    this.opts = opts;
    this.currentTarget = opts.target;
    this.currentResolved = opts.resolved;

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
    const tagSpan = document.createElement("span");
    meta.appendChild(fileSpan);
    meta.appendChild(tagSpan);
    el.appendChild(meta);
    this.fileSpan = fileSpan;
    this.tagSpan = tagSpan;

    const textarea = document.createElement("textarea");
    textarea.placeholder = "describe the change...";
    textarea.rows = 3;
    el.appendChild(textarea);
    this.textarea = textarea;

    // Thumbnails row sits between the textarea and the action row so it grows
    // downward as images are added without nudging the textarea around.
    const thumbs = document.createElement("div");
    thumbs.className = "attachment-thumbs empty";
    el.appendChild(thumbs);
    this.attachments = new AttachmentsController({ thumbsEl: thumbs });

    const row = document.createElement("div");
    row.className = "row";
    // No attach button here — the prompt box is a tight floating UI; users
    // attach images via paste or drag-and-drop instead. The sidebar composer
    // is roomier and does have an explicit attach button.
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = "↑↓←→ navigate · esc cancel · drop / paste images";
    const button = document.createElement("button");
    button.textContent = "Send";
    button.addEventListener("click", () => this.submit());
    row.appendChild(hint);
    row.appendChild(button);
    el.appendChild(row);

    opts.parent.appendChild(el);
    this.el = el;

    // Paste / drop into anywhere on the box (not just the textarea) so the
    // user doesn't have to land precisely on the input to attach.
    bindClipboardAndDrop(el, this.attachments);

    this.updateMeta();

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
    if (this.animationTimer !== null) clearTimeout(this.animationTimer);
    this.textarea.removeEventListener("keydown", this.boundKey);
    window.removeEventListener("pointerdown", this.boundDown, true);
    this.attachments.destroy();
    this.el.remove();
  }

  getCurrentTarget(): Element {
    return this.currentTarget;
  }

  getCurrentResolved(): ResolvedTarget {
    return this.currentResolved;
  }

  setTarget(target: Element, resolved: ResolvedTarget) {
    this.currentTarget = target;
    this.currentResolved = resolved;

    // re-center the box on the new element so it doesn't drift after several
    // navigations. We reset to the element's horizontal middle.
    const rect = target.getBoundingClientRect();
    this.clickOffsetX = rect.width / 2;
    this.clickOffsetY = rect.height / 2;

    this.updateMeta();
    this.beginPositionAnimation();
  }

  private beginPositionAnimation() {
    this.el.classList.add("animating-position");
    if (this.animationTimer !== null) clearTimeout(this.animationTimer);
    this.animationTimer = window.setTimeout(() => {
      this.el.classList.remove("animating-position");
      this.animationTimer = null;
    }, POSITION_ANIM_MS + 40);
  }

  private updateMeta() {
    this.fileSpan.textContent = formatLocation(this.currentResolved);
    this.tagSpan.textContent = `<${(this.currentTarget.tagName || "").toLowerCase()}>`;
  }

  private submit() {
    const value = this.textarea.value.trim();
    if (!value) return;
    this.opts.onSubmit(
      value,
      this.currentTarget,
      this.currentResolved,
      this.attachments.toPayload(),
    );
  }

  private async tryNavigate(direction: "up" | "down" | "left" | "right") {
    if (!this.opts.onNavigate || this.navigating) return;
    this.navigating = true;
    try {
      const result = await this.opts.onNavigate(this.currentTarget, direction);
      if (this.destroyed) return;
      if (result) {
        this.setTarget(result.target, result.resolved);
      }
    } finally {
      this.navigating = false;
    }
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
      return;
    }
    if (
      (e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight") &&
      this.textarea.value.length === 0
    ) {
      e.preventDefault();
      e.stopPropagation();
      const dir =
        e.key === "ArrowUp"
          ? "up"
          : e.key === "ArrowDown"
            ? "down"
            : e.key === "ArrowLeft"
              ? "left"
              : "right";
      void this.tryNavigate(dir);
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
    const rect = this.currentTarget.getBoundingClientRect();
    const boxWidth = this.el.offsetWidth || 360;
    const boxHeight = this.el.offsetHeight || 100;
    const margin = 8;

    let left: number;
    if (this.clickOffsetX !== null) {
      const anchorX = rect.left + this.clickOffsetX;
      left = anchorX - boxWidth / 2;
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
