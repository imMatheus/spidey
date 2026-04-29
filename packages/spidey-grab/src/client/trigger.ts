import { animate, stagger } from "motion";

export interface MenuItem {
  label: string;
  kbd?: string;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** If true, the menu stays open after click (e.g. for opening a submenu). */
  keepOpen?: boolean;
  /** Compact rendering: smaller font, single-row truncation. Used for history. */
  compact?: boolean;
  onClick: () => void;
}

export interface TriggerOpts {
  parent: HTMLElement;
  getMenuItems: () => MenuItem[];
  onCloseMenu?: () => void;
}

export class TriggerButton {
  private wrapper: HTMLDivElement;
  private button: HTMLDivElement;
  private counter: HTMLDivElement;
  private menu: HTMLUListElement | null = null;
  private menuOpen = false;
  private opts: TriggerOpts;
  private boundOutside: (e: PointerEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;
  private closeTimer: number | null = null;
  private swapToken = 0;

  constructor(opts: TriggerOpts) {
    this.opts = opts;

    const wrapper = document.createElement("div");
    wrapper.className = "trigger-wrapper";

    const button = document.createElement("div");
    button.className = "trigger";
    button.title = "spidey-grab";
    button.innerHTML = ICON;
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMenu();
    });
    wrapper.appendChild(button);

    const counter = document.createElement("div");
    counter.className = "trigger-counter";
    counter.setAttribute("aria-hidden", "true");
    wrapper.appendChild(counter);

    opts.parent.appendChild(wrapper);
    this.wrapper = wrapper;
    this.button = button;
    this.counter = counter;

    this.boundOutside = (e) => this.onOutsidePointerDown(e);
    this.boundKey = (e) => this.onKey(e);
  }

  setActive(active: boolean) {
    this.button.classList.toggle("active", active);
  }

  setCounts(running: number, done: number, failed: number) {
    const total = running + done + failed;
    this.counter.classList.remove("running", "idle", "failed");
    if (total === 0) {
      this.counter.classList.add("hidden");
      this.counter.replaceChildren();
      return;
    }
    this.counter.classList.remove("hidden");
    if (running > 0) {
      this.counter.classList.add("running");
      this.counter.textContent = String(running);
      this.counter.title = `${running} running · ${done} done${failed > 0 ? ` · ${failed} failed` : ""}`;
    } else if (failed > 0 && done === 0) {
      this.counter.classList.add("failed");
      this.counter.textContent = String(failed);
      this.counter.title = `${failed} failed`;
    } else {
      this.counter.classList.add("idle");
      this.counter.textContent = String(done + failed);
      this.counter.title = `${done} done${failed > 0 ? ` · ${failed} failed` : ""}`;
    }
  }

  closeMenu() {
    if (!this.menuOpen || !this.menu) return;
    this.menuOpen = false;
    const menu = this.menu;
    this.menu = null;
    menu.classList.remove("open");
    window.removeEventListener("pointerdown", this.boundOutside, true);
    window.removeEventListener("keydown", this.boundKey, true);
    if (this.closeTimer != null) clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      menu.remove();
    }, 220);
    this.opts.onCloseMenu?.();
  }

  isOpen(): boolean {
    return this.menuOpen;
  }

  setMenuItems(items: MenuItem[]) {
    if (!this.menu) return;
    const menu = this.menu;
    void this.morphMenu(menu, items);
  }

  private async morphMenu(menu: HTMLUListElement, items: MenuItem[]) {
    const token = ++this.swapToken;
    const stillCurrent = () => this.menu === menu && this.swapToken === token;

    // measure current rendered height before any swap
    menu.style.height = "";
    menu.style.overflow = "";
    const startHeight = menu.getBoundingClientRect().height;

    const oldChildren = Array.from(menu.children) as HTMLElement[];
    const newChildren = items.map((item) => this.renderItem(item));

    // fade old items in place at the current height
    menu.style.height = `${startHeight}px`;
    menu.style.overflow = "hidden";
    await animate(
      oldChildren,
      { opacity: [1, 0], y: [0, -4] },
      { duration: .12, ease: "easeIn" },
    ).finished;
    if (!stillCurrent()) return;

    // swap to the new set, prime them invisible
    menu.replaceChildren(...newChildren);
    for (const c of newChildren) {
      c.style.opacity = "0";
      c.style.transform = "translateY(6px)";
    }

    // measure target by briefly clearing the height lock, then re-lock so
    // there's no visible jump before motion takes over.
    menu.style.height = "";
    const endHeight = menu.getBoundingClientRect().height;
    menu.style.height = `${startHeight}px`;
    // force layout so the browser commits the locked height before animating
    void menu.offsetHeight;
    if (!stillCurrent()) return;

    const heightAnim = animate(startHeight, endHeight, {
      duration: 0.32,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        menu.style.height = `${latest}px`;
      },
    });

    const itemsAnim = animate(
      newChildren,
      { opacity: [0, 1], y: [6, 0] },
      { duration: 0.24, delay: stagger(0.03, { start: 0.05 }), ease: [0.22, 1, 0.36, 1] },
    );

    await Promise.all([heightAnim.finished, itemsAnim.finished]);
    if (!stillCurrent()) return;

    menu.style.height = "";
    menu.style.overflow = "";
    for (const c of newChildren) {
      c.style.opacity = "";
      c.style.transform = "";
    }
  }

  open(initialItems?: MenuItem[]) {
    this.openMenu(initialItems);
  }

  private toggleMenu() {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  private openMenu(initialItems?: MenuItem[]) {
    if (this.menuOpen) return;
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    const menu = document.createElement("ul");
    menu.className = "trigger-menu";
    menu.setAttribute("role", "menu");

    const items = initialItems ?? this.opts.getMenuItems();
    for (const item of items) {
      menu.appendChild(this.renderItem(item));
    }

    this.wrapper.appendChild(menu);
    this.menu = menu;
    this.menuOpen = true;

    // animate in on next frame so the initial state lands first
    requestAnimationFrame(() => {
      if (this.menu === menu) menu.classList.add("open");
    });

    window.addEventListener("pointerdown", this.boundOutside, true);
    window.addEventListener("keydown", this.boundKey, true);
  }

  private renderItem(item: MenuItem): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "trigger-menu-item";
    if (item.disabled) li.classList.add("disabled");
    if (item.variant === "danger") li.classList.add("danger");
    if (item.compact) li.classList.add("compact");
    li.setAttribute("role", "menuitem");
    li.tabIndex = -1;

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.label;
    li.appendChild(label);

    if (item.kbd) {
      const kbd = document.createElement("span");
      kbd.className = "kbd";
      // kbd may contain inline markup (e.g. the clock-icon time chip used in
      // history items). Callers control this string, so it's not user input.
      kbd.innerHTML = item.kbd;
      li.appendChild(kbd);
    }

    if (!item.disabled) {
      li.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!item.keepOpen) this.closeMenu();
        item.onClick();
      });
    }
    return li;
  }

  private onOutsidePointerDown(e: PointerEvent) {
    const path = e.composedPath();
    if (path.includes(this.wrapper)) return;
    this.closeMenu();
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu();
    }
  }
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 14 L4 10 L6 14"/>
    <path d="M12 16 L2 16 L4 19"/>
    <path d="M12 18 L4 22 L7 22"/>
    <path d="M13 20 L8 26 L11 25"/>
    <path d="M20 14 L28 10 L26 14"/>
    <path d="M20 16 L30 16 L28 19"/>
    <path d="M20 18 L28 22 L25 22"/>
    <path d="M19 20 L24 26 L21 25"/>
  </g>
  <ellipse cx="16" cy="19" rx="6" ry="7" fill="currentColor"/>
  <path d="M14 17 L18 17 L15 20 L18 23 L14 23 L17 20 Z" style="fill: var(--ds-red-700)"/>
  <circle cx="16" cy="13" r="4" fill="currentColor"/>
  <circle cx="14.5" cy="12" r="0.9" style="fill: hsla(var(--ds-gray-1000-value), 0.55)"/>
  <circle cx="17.5" cy="12" r="0.9" style="fill: hsla(var(--ds-gray-1000-value), 0.55)"/>
  <circle cx="14.5" cy="12.2" r="0.4" style="fill: var(--ds-gray-100)"/>
  <circle cx="17.5" cy="12.2" r="0.4" style="fill: var(--ds-gray-100)"/>
  <path d="M15 15.5 Q14 17 15 17.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M17 15.5 Q18 17 17 17.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;
