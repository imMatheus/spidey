export class TriggerButton {
  private el: HTMLDivElement;

  constructor(parent: HTMLElement, onClick: () => void) {
    const el = document.createElement("div");
    el.className = "trigger";
    el.title = "spidey-grab — click or ⌘G to pick an element";
    el.innerHTML = ICON;
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    parent.appendChild(el);
    this.el = el;
  }

  setActive(active: boolean) {
    this.el.classList.toggle("active", active);
  }
}

const ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m3 11 18-5v12L3 14v-3z"/>
  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
</svg>`;
