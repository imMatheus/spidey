import type { OverlayLayer } from "./overlay";

export interface PickOpts {
  isOwnNode: (node: Node | null) => boolean;
  onPick: (target: Element, clickX: number, clickY: number) => void;
  onCancel: () => void;
}

/**
 * Element-picker.
 *
 * The trick that makes click suppression bulletproof: while picking we cover
 * the viewport with a transparent fullscreen `<div>` (`captureLayer`). The
 * user's pointerdown/click physically lands on *that* element, so the browser
 * never dispatches a click on the underlying `<a>` / button — no navigation,
 * no React `onClick`, nothing.
 *
 * To find what the user actually pointed at, we briefly toggle the capture
 * layer's `pointer-events: none`, call `elementsFromPoint`, then restore it.
 *
 * The capture layer sits at `z-index: 2147483645`, just under our shadow host
 * (2147483646), so the trigger button and other UI render on top and stay
 * interactive — but everything in the host app is below it.
 */
export class Picker {
  private overlay: OverlayLayer;
  private opts: PickOpts;
  private active = false;
  private lastTarget: Element | null = null;
  private lastMoveAt = 0;
  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;
  private captureLayer: HTMLDivElement | null = null;

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
    document.documentElement.classList.add("spidey-sense-picking");

    // Build the capture layer. Transparent, full-viewport, crosshair cursor.
    // Listeners go on the layer itself so we don't need any window-level
    // suppression — the browser only fires events on the topmost element at
    // the click point, and that element is now ours.
    const layer = document.createElement("div");
    layer.dataset.spideySense = "picker-capture";
    layer.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483645",
      "background: transparent",
      "cursor: crosshair",
      // Block context menu inside the layer too (right-click on a link
      // shouldn't open the navigation menu while we're picking).
      "user-select: none",
      "-webkit-user-select: none",
    ].join("; ");
    layer.addEventListener("pointermove", this.boundMove);
    layer.addEventListener("pointerdown", this.boundDown);
    // Belt + suspenders: even though the click can't reach an underlying
    // element (we're on top), some browsers synthesise a click on the
    // capture layer itself. preventDefault keeps it from doing anything.
    layer.addEventListener("click", swallow);
    layer.addEventListener("auxclick", swallow);
    layer.addEventListener("contextmenu", swallow);
    layer.addEventListener("dragstart", swallow);
    document.body.appendChild(layer);
    this.captureLayer = layer;

    window.addEventListener("keydown", this.boundKey, true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    document.documentElement.classList.remove("spidey-sense-picking");
    if (this.captureLayer) {
      this.captureLayer.remove();
      this.captureLayer = null;
    }
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
    // The event target is the capture layer, not the underlying element —
    // so `preventDefault` on the layer's pointerdown is harmless to the host
    // page. We still call it to suppress the layer's own default behaviour
    // (focus shifts, drag-selection, etc).
    e.preventDefault();
    e.stopPropagation();
    const target = this.elementUnder(e.clientX, e.clientY);
    if (!target) {
      this.opts.onCancel();
      return;
    }
    this.opts.onPick(target, e.clientX, e.clientY);
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.opts.onCancel();
    }
  }

  /** Find the topmost host-app element under (x, y). The capture layer is on
   *  top of everything; toggle its pointer-events off briefly so the
   *  `elementsFromPoint` call sees through it. */
  private elementUnder(x: number, y: number): Element | null {
    const layer = this.captureLayer;
    let prevPe: string | undefined;
    if (layer) {
      prevPe = layer.style.pointerEvents;
      layer.style.pointerEvents = "none";
    }
    let result: Element | null = null;
    try {
      const stack = document.elementsFromPoint(x, y);
      for (const node of stack) {
        if (this.opts.isOwnNode(node)) continue;
        if (node === layer) continue;
        if (!(node instanceof Element)) continue;
        if (node === document.documentElement || node === document.body) continue;
        result = node;
        break;
      }
    } finally {
      if (layer) {
        layer.style.pointerEvents = prevPe || "";
      }
    }
    return result;
  }
}

function swallow(e: Event) {
  e.preventDefault();
  e.stopPropagation();
}

function labelFor(el: Element): string {
  const tag = (el.tagName || "").toLowerCase();
  if (!tag) return "";
  const id = el.id ? `#${el.id}` : "";
  return `<${tag}${id}>`;
}
