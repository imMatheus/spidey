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

export type SpideyPage = {
  id: string;
  /**
   * Discriminates between captured route screens and standalone component
   * previews. Optional for v1 backwards compat — absent means "route".
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
  /** innerHTML of <body> after sanitization */
  html: string;
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

export type SpideyDocument = {
  /** v1 = routes only; v2 adds the components pipeline */
  version: 1 | 2;
  generatedAt: string;
  project: {
    name: string;
    framework: Framework;
    root: string;
  };
  capture: {
    viewport: { width: number; height: number };
    devServerUrl: string;
  };
  pages: SpideyPage[];
  /** Catalog of discovered components, regardless of capture success */
  components?: ComponentSpec[];
};

/** Convenience: a serializable noop function placeholder. The viewer doesn't
 *  call props functions; this is a sentinel so JSON props can carry "function"
 *  values without losing type information. */
export const NOOP_FN_SENTINEL = "__spidey_noop__";
