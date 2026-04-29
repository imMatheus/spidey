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
