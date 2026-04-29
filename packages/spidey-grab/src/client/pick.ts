import type { OverlayLayer } from "./overlay";

export interface PickOpts {
  isOwnNode: (node: Node | null) => boolean;
  onPick: (target: Element) => void;
  onCancel: () => void;
}

export class Picker {
  private overlay: OverlayLayer;
  private opts: PickOpts;
  private active = false;
  private lastTarget: Element | null = null;
  private lastMoveAt = 0;
  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;

  constructor(overlay: OverlayLayer, opts: PickOpts) {
    this.overlay = overlay;
    this.opts = opts;
    this.boundMove = (e) => this.onMove(e);
    this.boundDown = (e) => this.onDown(e);
    this.boundKey = (e) => this.onKey(e);
  }

  start() {
    if (this.active) return;
    this.active = true;
    document.documentElement.classList.add("spidey-grab-picking");
    document.body.style.cursor = "crosshair";
    window.addEventListener("pointermove", this.boundMove, true);
    window.addEventListener("pointerdown", this.boundDown, true);
    window.addEventListener("keydown", this.boundKey, true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    document.documentElement.classList.remove("spidey-grab-picking");
    document.body.style.cursor = "";
    window.removeEventListener("pointermove", this.boundMove, true);
    window.removeEventListener("pointerdown", this.boundDown, true);
    window.removeEventListener("keydown", this.boundKey, true);
    this.overlay.clearHover();
    this.lastTarget = null;
  }

  private onMove(e: PointerEvent) {
    const now = performance.now();
    if (now - this.lastMoveAt < 16) return;
    this.lastMoveAt = now;
    const target = this.elementUnder(e.clientX, e.clientY);
    if (target === this.lastTarget) {
      if (target) this.overlay.setHover(target, labelFor(target));
      return;
    }
    this.lastTarget = target;
    this.overlay.setHover(target, target ? labelFor(target) : undefined);
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const target = this.elementUnder(e.clientX, e.clientY);
    if (!target) {
      this.opts.onCancel();
      return;
    }
    this.opts.onPick(target);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onCancel();
    }
  }

  private elementUnder(x: number, y: number): Element | null {
    const stack = document.elementsFromPoint(x, y);
    for (const node of stack) {
      if (this.opts.isOwnNode(node)) continue;
      if (!(node instanceof Element)) continue;
      if (node === document.documentElement || node === document.body) continue;
      return node;
    }
    return null;
  }
}

function labelFor(el: Element): string {
  const tag = (el.tagName || "").toLowerCase();
  if (!tag) return "";
  const id = el.id ? `#${el.id}` : "";
  return `<${tag}${id}>`;
}
