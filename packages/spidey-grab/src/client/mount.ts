import { STYLES } from "./styles";

export interface ShadowMount {
  host: HTMLDivElement;
  root: ShadowRoot;
  layer: HTMLDivElement;
}

export function mountShadow(): ShadowMount {
  const host = document.createElement("div");
  host.dataset.spideyGrab = "true";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "2147483646";
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);

  const layer = document.createElement("div");
  layer.className = "layer";
  root.appendChild(layer);

  return { host, root, layer };
}
