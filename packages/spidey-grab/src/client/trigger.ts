export interface MenuItem {
  label: string;
  kbd?: string;
  variant?: "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
}

export interface TriggerOpts {
  parent: HTMLElement;
  getMenuItems: () => MenuItem[];
}

export class TriggerButton {
  private wrapper: HTMLDivElement;
  private button: HTMLDivElement;
  private menu: HTMLUListElement | null = null;
  private menuOpen = false;
  private opts: TriggerOpts;
  private boundOutside: (e: PointerEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;
  private closeTimer: number | null = null;

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

    opts.parent.appendChild(wrapper);
    this.wrapper = wrapper;
    this.button = button;

    this.boundOutside = (e) => this.onOutsidePointerDown(e);
    this.boundKey = (e) => this.onKey(e);
  }

  setActive(active: boolean) {
    this.button.classList.toggle("active", active);
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
  }

  private toggleMenu() {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  private openMenu() {
    if (this.menuOpen) return;
    if (this.closeTimer != null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }

    const menu = document.createElement("ul");
    menu.className = "trigger-menu";
    menu.setAttribute("role", "menu");

    const items = this.opts.getMenuItems();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "trigger-menu-item";
      if (item.disabled) li.classList.add("disabled");
      if (item.variant === "danger") li.classList.add("danger");
      li.setAttribute("role", "menuitem");
      li.tabIndex = -1;

      const label = document.createElement("span");
      label.textContent = item.label;
      li.appendChild(label);

      if (item.kbd) {
        const kbd = document.createElement("span");
        kbd.className = "kbd";
        kbd.textContent = item.kbd;
        li.appendChild(kbd);
      }

      if (!item.disabled) {
        li.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeMenu();
          item.onClick();
        });
      }

      menu.appendChild(li);
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
