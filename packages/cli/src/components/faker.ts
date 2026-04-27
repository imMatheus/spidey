import { faker, Faker, en } from "@faker-js/faker";
import type { ComponentSpec, PropSpec } from "./types.js";
import { NOOP_FN_SENTINEL } from "./types.js";

/**
 * Generate a JSON-serializable props object for a component, using faker
 * heuristics keyed primarily on the prop name. Seed faker with a stable
 * hash of the component name so the same component captures consistently
 * across runs.
 *
 * Heuristics here matter a LOT for preview quality:
 *   - Optional props are mostly skipped so the component's *own* defaults
 *     get a chance to apply (e.g. `<Rating max={5}>`). Without this,
 *     faker would supply `max=69` and the component would render 69
 *     stars at faker-supplied huge sizes.
 *   - Specific name regexes return semantically-shaped values
 *     (a `size` prop returns 14–24, a `color` prop returns a dark
 *     visible hex, an `href` returns a URL, etc.).
 */
/**
 * Layout-or-state-modifying booleans that, when faker flips them on,
 * make previews render unusably (full-width buttons collapse inside the
 * inline-block preview wrapper, spinners replace content, hidden hides
 * the whole thing). Always skip these — the component's default
 * value (typically false / off) is what we want for a master tile.
 */
const NEVER_GENERATE = new Set([
  "fullwidth",
  "fullheight",
  "block",
  "stretched",
  "stretch",
  "fluid",
  "loading",
  "disabled",
  "readonly",
  "hidden",
  "invisible",
  "collapsed",
  "open", // unless the component is e.g. a dialog opening it explicitly
]);

/**
 * Visually-meaningful prop names. These are the props that actually
 * affect what the user sees in a master tile. Anything not on this list
 * AND not required is treated as framework noise and skipped.
 *
 * Without this filter, components typed with React's `SVGProps` /
 * `HTMLAttributes` get hundreds of attributes and a runaway `style`
 * object full of every CSS property — both clutter the captured DOM
 * and frequently distort the visual.
 */
const MEANINGFUL_PROP = new RegExp(
  "^(" +
    [
      // Text / content
      "children",
      "title",
      "label",
      "name",
      "description",
      "subtitle",
      "heading",
      "caption",
      "body",
      "text",
      "content",
      "placeholder",
      "footer",
      "header",
      "action",
      // Media
      "src",
      "alt",
      "href",
      "url",
      "image",
      "thumbnail",
      "avatar",
      "icon",
      "iconLeft",
      "iconRight",
      // Visual
      "color",
      "tone",
      "variant",
      "status",
      "kind",
      "size",
      "shape",
      "rounded",
      "elevated",
      "hoverable",
      "dot",
      "showValue",
      "showLabel",
      // Data
      "value",
      "defaultValue",
      "checked",
      "items",
      "list",
      "options",
      "tabs",
      "rating",
      "score",
      "max",
      "min",
      "count",
      "step",
      // Layout
      "className",
      "width",
      "height",
      // SVG/icons — minimal set that drives rendering
      "viewBox",
      "fill",
      "stroke",
      "strokeWidth",
      // Behavior surfaces
      "onClick",
      "onChange",
      "onSelect",
      // Common identifiers
      "id",
      "type",
      "role",
    ].join("|") +
    ")$",
  "i",
);

export function generateProps(
  component: ComponentSpec,
): Record<string, unknown> {
  const seeded = new Faker({ locale: [en] });
  seeded.seed(hashString(component.name));

  const out: Record<string, unknown> = {};
  for (const [propName, spec] of Object.entries(component.props)) {
    if (NEVER_GENERATE.has(propName.toLowerCase())) continue;
    // Required props always generate.
    if (!spec.optional) {
      out[propName] = generateValue(propName, spec, seeded);
      continue;
    }
    // Optional props: keep only the visually-meaningful ones and drop the
    // framework-noise rest (every SVG attribute, every aria-*, every
    // CSS property in `style`). With these dropped, captured masters stop
    // shipping a 500-key `style` object full of lorem-ipsum CSS values.
    if (!MEANINGFUL_PROP.test(propName)) continue;
    if (shouldSkipOptional(propName, seeded)) continue;
    out[propName] = generateValue(propName, spec, seeded);
  }

  // Common React: a `children` prop expects a node — supply readable text.
  if (!("children" in out) && component.props.children?.kind === "node") {
    out.children = "Sample content";
  }

  return out;
}

/**
 * Decide whether to skip an optional prop. Default: skip 80% of the time
 * so the component's defaults dominate. A few prop kinds we always-or-
 * almost-always supply because they're visually load-bearing.
 */
function shouldSkipOptional(name: string, rnd: Faker): boolean {
  const n = name.toLowerCase();
  // Always supply visually load-bearing text/content props
  if (/^(title|label|heading|name|description|subtitle|body|text|content)$/.test(n))
    return false;
  if (n === "children") return false;
  // Always supply image-like
  if (/^(src|thumbnail|avatar|image|photo)$/.test(n)) return false;
  // Skip 80% of everything else
  return rnd.number.float({ min: 0, max: 1 }) > 0.2;
}

function generateValue(
  name: string,
  spec: PropSpec,
  rnd: Faker,
): unknown {
  switch (spec.kind) {
    case "string":
      return stringFor(name, rnd);
    case "number":
      return numberFor(name, rnd);
    case "boolean":
      return rnd.datatype.boolean();
    case "literal":
      return spec.value;
    case "enum":
      return rnd.helpers.arrayElement(spec.values);
    case "array": {
      const len = arrayLengthFor(name);
      return Array.from({ length: len }, () =>
        generateValue(singularize(name), spec.of, rnd),
      );
    }
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(spec.fields)) {
        if (v.optional && shouldSkipOptional(k, rnd)) continue;
        obj[k] = generateValue(k, v, rnd);
      }
      return obj;
    }
    case "function":
      return NOOP_FN_SENTINEL;
    case "node":
      return "Sample content";
    case "unknown":
    default:
      return rnd.lorem.word();
  }
}

// SVG attributes have specific shape/value expectations. Without these,
// previews of icon-style components ship with `width: "carmen"` instead
// of `width: "24"`, and the SVG renders empty.
//
// Keys are normalized: lowercased + dashes stripped, so both the React
// camelCase name (`strokeWidth`) and the DOM kebab name (`stroke-width`)
// hit the same default.
const SVG_DEFAULTS: Record<string, () => string> = {
  // width/height intentionally NOT here — they double as CSS-dimension
  // props on non-SVG components (`<Skeleton width="24px"/>`). The
  // CSS-dimension regex below appends "px" so values render as valid
  // CSS; SVG also accepts "24px" as a width attribute.
  viewbox: () => "0 0 24 24",
  fill: () => "none",
  stroke: () => "currentColor",
  strokewidth: () => "2",
  strokelinecap: () => "round",
  strokelinejoin: () => "round",
  cx: () => "12",
  cy: () => "12",
  r: () => "8",
  x: () => "0",
  y: () => "0",
  x1: () => "4",
  x2: () => "20",
  y1: () => "12",
  y2: () => "12",
  d: () => "M4 4 L20 4 L20 20 L4 20 Z",
  points: () => "4,4 20,4 20,20 4,20",
  preserveaspectratio: () => "xMidYMid meet",
  xmlns: () => "http://www.w3.org/2000/svg",
};

// Common HTML/React attributes that take semantic strings, not lorem.
const HTML_DEFAULTS: Record<string, () => string> = {
  type: () => "text",
  role: () => "button",
  lang: () => "en",
  dir: () => "ltr",
  rel: () => "noopener",
  target: () => "_blank",
  method: () => "post",
  autocomplete: () => "off",
  spellcheck: () => "false",
  contenteditable: () => "false",
  draggable: () => "false",
  hidden: () => "false",
  // `color` is contextual — too often used as the SVG `color` attribute
  // (driving currentColor). Default to a high-contrast dark so icons stay
  // visible on light preview backgrounds.
  color: () => "#0f172a",
};

function stringFor(name: string, rnd: Faker): string {
  const n = name.toLowerCase();
  // Strip dashes too so kebab and camelCase names hit the same default
  // (e.g. `strokeWidth` and `stroke-width` both → `strokewidth`).
  const norm = n.replace(/-/g, "");
  // Specific attribute names — defaults that produce a renderable element.
  if (norm in SVG_DEFAULTS) return SVG_DEFAULTS[norm]();
  if (norm in HTML_DEFAULTS) return HTML_DEFAULTS[norm]();
  // CSS-dimension–shaped string props (width/height/padding/margin/gap…
  // when typed as `string | number`). React appends "px" to numbers but
  // honors strings as-is — so a string "24" becomes invalid CSS. Append
  // a unit so the rendered element actually has dimensions.
  if (
    /^(width|height|minwidth|minheight|maxwidth|maxheight|top|left|right|bottom|gap|padding|margin|inset|fontsize|lineheight|borderradius)$/.test(
      norm,
    )
  ) {
    return `${rnd.number.int({ min: 16, max: 32 })}px`;
  }
  if (/email/.test(n)) return rnd.internet.email();
  if (/(^|_|\b)(name)$|user/.test(n)) return rnd.person.fullName();
  if (/url|href|link/.test(n)) return rnd.internet.url();
  if (/title|heading|label|cta/.test(n))
    return rnd.lorem.words({ min: 2, max: 4 });
  if (/description|body|text|content|caption|subtitle/.test(n))
    return rnd.lorem.sentence();
  if (/(^id$|uuid)/.test(n)) return rnd.string.uuid();
  if (/avatar|image|photo|src|thumbnail/.test(n)) return rnd.image.url();
  if (/icon/.test(n)) return "✨";
  if (/(^|_)slug$/.test(n)) return rnd.lorem.slug();
  // Use a curated dark-friendly palette instead of fully random RGB so
  // previews don't end up with light-on-light invisible elements.
  if (/color/.test(n))
    return rnd.helpers.arrayElement([
      "#0f172a",
      "#5b6cff",
      "#16a34a",
      "#dc2626",
      "#d97706",
      "#0284c7",
      "#7c3aed",
    ]);
  if (/date|time/.test(n)) return rnd.date.recent().toISOString();
  if (/phone/.test(n)) return rnd.phone.number();
  if (/city/.test(n)) return rnd.location.city();
  if (/country/.test(n)) return rnd.location.country();
  return rnd.lorem.word();
}

function numberFor(name: string, rnd: Faker): number {
  const n = name.toLowerCase();
  if (/price|cost|amount/.test(n))
    return Number(
      rnd.number.float({ min: 1, max: 999, fractionDigits: 2 }).toFixed(2),
    );
  if (/percent|progress/.test(n))
    return rnd.number.int({ min: 0, max: 100 });
  if (/age/.test(n)) return rnd.number.int({ min: 18, max: 80 });
  if (/year/.test(n)) return rnd.number.int({ min: 1990, max: 2030 });
  if (/delta|change|diff/.test(n))
    return rnd.number.int({ min: -50, max: 50 });
  // Sizing/iteration props need to stay small. `Rating max={N}` would
  // otherwise render N=69 stars; `size`/`width`/`height` would balloon
  // a 14-px icon to 99-px. Keep these in a sensible visual range.
  if (/^(size|width|height|radius)$/.test(n))
    return rnd.number.int({ min: 16, max: 32 });
  if (
    /^(max|min|step|rows|cols|length|count|qty|quantity|num|total|limit|page|index)$/.test(
      n,
    )
  )
    return rnd.number.int({ min: 1, max: 6 });
  // CSS dimensions — when typed as `number`, React adds `px` automatically.
  if (
    /^(top|left|right|bottom|gap|padding|margin|inset|fontsize|lineheight)$/.test(
      n,
    )
  )
    return rnd.number.int({ min: 4, max: 32 });
  if (/value|score|rating/.test(n))
    return rnd.number.float({ min: 0, max: 5, fractionDigits: 1 });
  return rnd.number.int({ min: 1, max: 8 });
}

function arrayLengthFor(name: string): number {
  // Heuristic so an array of "items" doesn't blow up to 1000 entries.
  return 3;
}

function singularize(name: string): string {
  // Trivial: "items" -> "item", "stories" -> "story". Faker doesn't care, so
  // any reasonable approximation is fine — heuristics only need to feed
  // stringFor / numberFor.
  if (name.endsWith("ies")) return name.slice(0, -3) + "y";
  if (name.endsWith("s") && !name.endsWith("ss")) return name.slice(0, -1);
  return name;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Re-export so callers can detect the noop sentinel without re-importing
// from shared.
export { NOOP_FN_SENTINEL };
// Silence unused-warning for the default faker export
void faker;
