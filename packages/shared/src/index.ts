export type Framework = "vite" | "next";

/**
 * A single PropSpec describes the shape of one prop on a discovered React
 * component, used both to drive faker-based dummy-data generation and to
 * surface prop info in the viewer.
 */
export type PropSpec =
  | { kind: "string"; optional: boolean }
  | { kind: "number"; optional: boolean }
  | { kind: "boolean"; optional: boolean }
  | { kind: "literal"; value: string | number | boolean; optional: boolean }
  | {
      kind: "enum";
      values: (string | number | boolean)[];
      optional: boolean;
    }
  | { kind: "array"; of: PropSpec; optional: boolean }
  | { kind: "object"; fields: Record<string, PropSpec>; optional: boolean }
  | { kind: "function"; optional: boolean }
  | { kind: "node"; optional: boolean }
  | { kind: "unknown"; optional: boolean };

export type ComponentSpec = {
  name: string;
  /** Absolute path to the source file */
  file: string;
  /** Path relative to the project root */
  relPath: string;
  exportKind: "named" | "default";
  /** Original props type alias / interface name, when known */
  propsName?: string;
  props: Record<string, PropSpec>;
};

/**
 * v3 introduces a node-based representation of each captured tile so the
 * viewer can edit it. Each element node carries id, tag, attrs and a parsed
 * inline-style record. Text nodes are leaves. The captured CSS still travels
 * as a string per tile (class-based selectors keep working).
 *
 * IDs are stable per tile: capture emits `t{tileIdx}-n{counter}`; the editor
 * uses a `u-` prefix for inserts so it's clear at a glance which nodes
 * existed at capture time vs. were drawn by the user.
 */
export type SpideyNode =
  | {
      id: string;
      kind: "el";
      tag: string;
      attrs: Record<string, string>;
      style: Record<string, string>;
      children: SpideyNode[];
    }
  | { id: string; kind: "text"; value: string };

export type SpideyTile = {
  id: string;
  /**
   * Discriminates between captured route screens and standalone component
   * previews. Optional for legacy v1 docs — absent means "route".
   */
  kind?: "route" | "component";

  /** Pattern as discovered, e.g. "/users/[id]" — for routes only */
  route?: string;
  /** Concrete URL captured (placeholders substituted) — for routes only */
  url?: string;
  title?: string;

  /** Filled for kind === "component" */
  component?: {
    name: string;
    file: string;
    propsUsed: Record<string, unknown>;
  };

  status: "ok" | "error";
  error?: string;

  /**
   * The captured DOM as a structured node tree. v3 docs always populate this
   * (or null when status==="error"); legacy v1/v2 docs use `html` instead and
   * the viewer translates them at load time.
   */
  tree?: SpideyNode | null;
  /** Legacy: innerHTML of <body> after sanitization. v1/v2 only. */
  html?: string;

  /** Concatenated CSS from all stylesheets, inline + external */
  css: string;
  capturedAt: string;
  /** Browser viewport during capture (1280×800 by default). */
  viewport: { width: number; height: number };
  /**
   * Natural size of the captured content, when it's smaller than the
   * viewport. Component tiles populate this so their tile in the viewer
   * fits the component snugly instead of being a 1280×800 page.
   */
  containerSize?: { width: number; height: number };
  /**
   * Attributes from the captured page's <body> element. The viewer mounts
   * captured HTML inside a shadow root and synthesizes a <body> wrapper
   * so global selectors like `body { ... }` match — these attributes
   * (class, lang, dir, data-*) are applied so theming-by-attribute
   * selectors keep working. Event handlers (`on*`) are stripped at
   * capture time.
   */
  bodyAttrs?: Record<string, string>;
  /** Same as bodyAttrs, for the <html> element. */
  htmlAttrs?: Record<string, string>;
};

/**
 * Backwards-compat alias. Existing viewer code reads `SpideyPage` everywhere;
 * keep the name as a re-export of the new `SpideyTile` type so callers don't
 * break, while the canonical name moves to `SpideyTile` to match the
 * `tiles[]` field on the document.
 */
export type SpideyPage = SpideyTile;

export type SpideyDocument = {
  /** v1 = routes only; v2 added components; v3 added editable node trees. */
  version: 1 | 2 | 3;
  generatedAt: string;
  /** Set by the viewer's autosave on every PUT — used by the CLI to warn
   *  before clobbering edits on regenerate. */
  editedAt?: string;
  project: {
    name: string;
    framework: Framework;
    root: string;
  };
  capture: {
    viewport: { width: number; height: number };
    devServerUrl: string;
  };
  /**
   * v3 uses `tiles`. v1/v2 docs use `pages`. The viewer reads whichever is
   * present; the CLI only writes `tiles` (and v3) going forward.
   */
  tiles?: SpideyTile[];
  /** Legacy v1/v2 field. */
  pages?: SpideyTile[];
  /** Catalog of discovered components, regardless of capture success */
  components?: ComponentSpec[];
};

/** Convenience: a serializable noop function placeholder. The viewer doesn't
 *  call props functions; this is a sentinel so JSON props can carry "function"
 *  values without losing type information. */
export const NOOP_FN_SENTINEL = "__spidey_noop__";
