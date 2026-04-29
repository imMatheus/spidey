import type { SpideyNode } from "@spidey/shared";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Render a SpideyNode tree into live DOM. Each element gets a
 * `data-spidey-id` attribute so the editor can resolve a node id back to
 * a live HTMLElement by querying the shadow root.
 *
 * `inSvg` tracks whether we've crossed an `<svg>` boundary so descendants
 * are created in the SVG namespace.
 */
export function renderNode(node: SpideyNode, inSvg = false): Node {
  if (node.kind === "text") {
    return document.createTextNode(node.value);
  }

  const tag = node.tag;
  const inSvgNow = inSvg || tag === "svg";
  const el = inSvgNow
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);

  for (const [name, value] of Object.entries(node.attrs)) {
    // Defense in depth — capture already strips on*. Skip any that slipped
    // through (e.g. JSON authored by hand).
    if (name.toLowerCase().startsWith("on")) continue;
    // Skip `loading="lazy"` on captured images. Tiles render inside a
    // CSS-transformed canvas, frequently translated off the layout viewport;
    // the browser's lazy-load IntersectionObserver fires against the layout
    // viewport, so off-screen tiles never start fetching, and even after the
    // user pans to a tile the load often stays pending under the transform.
    // Force eager loading for the editor preview.
    if (name.toLowerCase() === "loading" && value === "lazy") continue;
    try {
      el.setAttribute(name, value);
    } catch {
      // ignore exotic attribute names
    }
  }

  for (const [prop, value] of Object.entries(node.style)) {
    try {
      (el as HTMLElement).style.setProperty(prop, value);
    } catch {
      // ignore
    }
  }

  el.setAttribute("data-spidey-id", node.id);

  for (const child of node.children) {
    el.appendChild(renderNode(child, inSvgNow));
  }

  return el;
}

/** Look up the live HTMLElement for a given node id within a root. */
export function findElementById(
  root: ParentNode,
  id: string,
): HTMLElement | null {
  const sel = `[data-spidey-id="${escapeAttr(id)}"]`;
  return root.querySelector(sel) as HTMLElement | null;
}

/** Read the spidey-id attribute off an element. */
export function getNodeId(el: Element | null): string | null {
  return el?.getAttribute("data-spidey-id") ?? null;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '\\"');
}
