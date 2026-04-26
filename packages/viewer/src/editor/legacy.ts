import type { SpideyDocument, SpideyNode, SpideyTile } from "@spidey/shared";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE"]);

/**
 * v1/v2 docs carry tiles in `pages` with raw `html` strings; v3 uses `tiles`
 * with structured `tree`. The viewer only ever speaks v3 internally; this
 * function migrates legacy docs in-place at load time. The CLI is not
 * involved — the next viewer save upgrades the file on disk.
 */
export function normalizeDoc(doc: SpideyDocument): SpideyDocument {
  // Already v3 with tiles[] — pass through (but make sure each tile has a
  // `tree` field, falling back to converting `html` if a v3 tile somehow
  // arrived missing one).
  if (doc.version === 3 && doc.tiles) {
    return {
      ...doc,
      tiles: doc.tiles.map(ensureTreeOnTile),
    };
  }

  // v1/v2 — pages[] of html strings. Lift to tiles[] with parsed trees.
  const legacyPages = doc.pages ?? [];
  let tileIdx = 0;
  const tiles = legacyPages.map((p) => ensureTreeOnTile(p, tileIdx++));
  return {
    ...doc,
    version: 3,
    tiles,
    pages: undefined,
  };
}

function ensureTreeOnTile(tile: SpideyTile, fallbackIdx = 0): SpideyTile {
  if (tile.tree !== undefined) return tile;
  if (tile.status === "error" || !tile.html) {
    return { ...tile, tree: null };
  }
  const tree = parseHtmlToTree(tile.html, fallbackIdx);
  return { ...tile, tree };
}

/** Parse an HTML string (innerHTML of a body) into a synthetic SpideyNode
 *  tree rooted at a virtual <body> element. Generates ids on the fly. */
export function parseHtmlToTree(html: string, tileIdx: number): SpideyNode | null {
  if (typeof DOMParser === "undefined") return null;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  let counter = 0;
  const nextId = () => `t${tileIdx}-n${counter++}`;

  const root: SpideyNode = {
    id: nextId(),
    kind: "el",
    tag: "body",
    attrs: {},
    style: {},
    children: walkChildren(wrapper, nextId),
  };
  return root;
}

function walkChildren(
  parent: ParentNode,
  nextId: () => string,
): SpideyNode[] {
  const out: SpideyNode[] = [];
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text.trim()) {
        out.push({ id: nextId(), kind: "text", value: text });
      }
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    if (SKIP_TAGS.has(el.tagName)) continue;
    const tag = el.tagName.toLowerCase();
    const attrs: Record<string, string> = {};
    let style: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      if (name.startsWith("on")) continue;
      if (
        (name === "href" || name === "src" || name === "action") &&
        /^\s*javascript:/i.test(a.value)
      ) {
        continue;
      }
      if (name === "style") {
        style = parseInline(a.value);
        continue;
      }
      attrs[a.name] = a.value;
    }
    out.push({
      id: nextId(),
      kind: "el",
      tag,
      attrs,
      style,
      children: walkChildren(el, nextId),
    });
  }
  return out;
}

function parseInline(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const decl of s.split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    const k = decl.slice(0, colon).trim();
    const v = decl.slice(colon + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}
