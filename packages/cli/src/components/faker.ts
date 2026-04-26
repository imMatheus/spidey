import { faker, Faker, en } from "@faker-js/faker";
import type { ComponentSpec, PropSpec } from "./types.js";
import { NOOP_FN_SENTINEL } from "./types.js";

/**
 * Generate a JSON-serializable props object for a component, using faker
 * heuristics keyed primarily on the prop name. Seed faker with a stable
 * hash of the component name so the same component captures consistently
 * across runs.
 */
export function generateProps(
  component: ComponentSpec,
): Record<string, unknown> {
  const seeded = new Faker({ locale: [en] });
  seeded.seed(hashString(component.name));

  const out: Record<string, unknown> = {};
  for (const [propName, spec] of Object.entries(component.props)) {
    if (spec.optional && seeded.number.float({ min: 0, max: 1 }) > 0.7)
      continue;
    out[propName] = generateValue(propName, spec, seeded);
  }

  // Common React: a `children` prop expects a node — supply readable text
  if (!("children" in out) && component.props.children?.kind === "node") {
    out.children = "Sample content";
  }

  return out;
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
      const len = 3;
      return Array.from({ length: len }, () =>
        generateValue(singularize(name), spec.of, rnd),
      );
    }
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(spec.fields)) {
        if (v.optional && rnd.number.float({ min: 0, max: 1 }) > 0.7) continue;
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

function stringFor(name: string, rnd: Faker): string {
  const n = name.toLowerCase();
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
  if (/color/.test(n)) return rnd.color.rgb();
  if (/date|time/.test(n)) return rnd.date.recent().toISOString();
  if (/phone/.test(n)) return rnd.phone.number();
  if (/city/.test(n)) return rnd.location.city();
  if (/country/.test(n)) return rnd.location.country();
  return rnd.lorem.word();
}

function numberFor(name: string, rnd: Faker): number {
  const n = name.toLowerCase();
  if (/price|cost|amount/.test(n))
    return Number(rnd.number.float({ min: 1, max: 999, fractionDigits: 2 }).toFixed(2));
  if (/percent|progress/.test(n))
    return rnd.number.int({ min: 0, max: 100 });
  if (/age/.test(n)) return rnd.number.int({ min: 18, max: 80 });
  if (/year/.test(n)) return rnd.number.int({ min: 1990, max: 2030 });
  if (/count|qty|quantity|num|total|index/.test(n))
    return rnd.number.int({ min: 0, max: 100 });
  if (/delta|change|diff/.test(n))
    return rnd.number.int({ min: -50, max: 50 });
  return rnd.number.int({ min: 1, max: 99 });
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
