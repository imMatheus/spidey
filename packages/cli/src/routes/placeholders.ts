/**
 * Substitute concrete values for dynamic params in a route pattern.
 *
 * Supports both Next ("/users/[id]") and React Router (":id") styles.
 * Catch-all and optional-catch-all segments are NOT substituted — caller
 * should filter them out for v0.
 */
export function substitutePlaceholders(pattern: string): string {
  // Next-style [param]
  let url = pattern.replace(/\[([^\]/]+)\]/g, (_m, name) => placeholderFor(name));
  // React Router :param (optional trailing ?)
  url = url.replace(/:([A-Za-z_][A-Za-z0-9_]*)\??/g, (_m, name) =>
    placeholderFor(name),
  );
  return url;
}

export function isCatchAll(pattern: string): boolean {
  // Next [...slug] / [[...slug]] or React Router * splats
  return /\[\.\.\.|\*$|\*\/|\/\*$/.test(pattern);
}

function placeholderFor(name: string): string {
  const lower = name.toLowerCase();
  if (
    lower === "id" ||
    lower.endsWith("id") ||
    lower === "num" ||
    lower === "index"
  )
    return "1";
  if (lower === "slug" || lower === "name" || lower === "handle") return "example";
  if (lower === "lang" || lower === "locale") return "en";
  return "placeholder";
}
