import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import { walkFiles } from "../util.js";
import { isCatchAll, substitutePlaceholders } from "./placeholders.js";
import type { DiscoveredRoute } from "./next.js";

// @babel/traverse ships its default export oddly under ESM
const traverse = ((_traverse as any).default ?? _traverse) as typeof _traverse;

/**
 * Discover routes in a Vite + react-router-dom project.
 *
 * Two patterns are supported:
 *
 * 1. JSX:
 *      <Route path="/" element={...} />
 *      <Route path="users">
 *        <Route path=":id" element={...} />
 *      </Route>
 *
 * 2. Object config:
 *      createBrowserRouter([{ path: "/", element: ..., children: [...] }])
 */
export function discoverViteRoutes(root: string): DiscoveredRoute[] {
  const srcDir = path.join(root, "src");
  const candidates = walkFiles(
    fs.existsSync(srcDir) ? srcDir : root,
    (f) => /\.(t|j)sx?$/.test(f),
  );

  const patterns = new Set<string>();

  for (const file of candidates) {
    const code = fs.readFileSync(file, "utf8");
    if (!/\b(Route|createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes)\b/.test(code))
      continue;

    let ast;
    try {
      ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
      });
    } catch {
      continue;
    }

    traverse(ast, {
      // <Route path="..." />
      JSXElement(p) {
        const opening = p.node.openingElement;
        if (!t.isJSXIdentifier(opening.name)) return;
        if (opening.name.name !== "Route") return;
        const patternHere = readJsxPathAttr(opening);
        if (patternHere == null) return;
        const ancestry = collectJsxRouteAncestry(p);
        const full = joinSegments([...ancestry, patternHere]);
        if (full && !isCatchAll(full)) patterns.add(full);
      },
      // createBrowserRouter([...]) and similar
      CallExpression(p) {
        const callee = p.node.callee;
        if (!t.isIdentifier(callee)) return;
        const name = callee.name;
        if (
          name !== "createBrowserRouter" &&
          name !== "createHashRouter" &&
          name !== "createMemoryRouter" &&
          name !== "useRoutes"
        )
          return;
        const arg = p.node.arguments[0];
        const arr = resolveArrayExpression(arg, p);
        if (!arr) return;
        collectFromArray(arr, [], patterns);
      },
    });
  }

  const out = Array.from(patterns)
    .map((pattern) => ({
      pattern,
      url: substitutePlaceholders(pattern, root),
    }))
    .sort((a, b) => {
      const da = a.pattern.split("/").length;
      const db = b.pattern.split("/").length;
      if (da !== db) return da - db;
      return a.pattern.localeCompare(b.pattern);
    });
  return out;
}

function readJsxPathAttr(opening: t.JSXOpeningElement): string | null {
  for (const attr of opening.attributes) {
    if (!t.isJSXAttribute(attr)) continue;
    if (!t.isJSXIdentifier(attr.name) || attr.name.name !== "path") continue;
    const v = attr.value;
    if (t.isStringLiteral(v)) return v.value;
    if (
      t.isJSXExpressionContainer(v) &&
      t.isStringLiteral(v.expression)
    )
      return v.expression.value;
    return null;
  }
  // <Route index /> → no path
  return null;
}

/**
 * If the call argument is an array literal, return it. If it's an identifier
 * bound to an array literal in scope (single-binding lookup), return that.
 * Anything else returns null — we don't try to follow re-assignments or
 * arbitrary expressions for v0.
 */
function resolveArrayExpression(
  node: t.Node | undefined,
  callPath: any,
): t.ArrayExpression | null {
  if (!node) return null;
  if (t.isArrayExpression(node)) return node;
  if (!t.isIdentifier(node)) return null;
  const binding = callPath.scope.getBinding(node.name);
  if (!binding) return null;
  const init = (binding.path.node as any).init;
  if (init && t.isArrayExpression(init)) return init;
  return null;
}

function collectJsxRouteAncestry(p: any): string[] {
  const segments: string[] = [];
  let parent = p.parentPath;
  while (parent) {
    if (
      parent.isJSXElement() &&
      t.isJSXIdentifier(parent.node.openingElement.name) &&
      parent.node.openingElement.name.name === "Route"
    ) {
      const ancestorPath = readJsxPathAttr(parent.node.openingElement);
      if (ancestorPath) segments.unshift(ancestorPath);
    }
    parent = parent.parentPath;
  }
  return segments;
}

function collectFromArray(
  arr: t.ArrayExpression,
  parentSegments: string[],
  out: Set<string>,
): void {
  for (const el of arr.elements) {
    if (!t.isObjectExpression(el)) continue;
    let pathSeg: string | null = null;
    let children: t.ArrayExpression | null = null;
    let isIndex = false;
    for (const prop of el.properties) {
      if (!t.isObjectProperty(prop)) continue;
      const key = t.isIdentifier(prop.key)
        ? prop.key.name
        : t.isStringLiteral(prop.key)
          ? prop.key.value
          : null;
      if (key === "path" && t.isStringLiteral(prop.value)) {
        pathSeg = prop.value.value;
      } else if (key === "index" && t.isBooleanLiteral(prop.value)) {
        isIndex = prop.value.value;
      } else if (key === "children" && t.isArrayExpression(prop.value)) {
        children = prop.value;
      }
    }
    const nextSegments =
      pathSeg != null ? [...parentSegments, pathSeg] : parentSegments;
    if (pathSeg != null || isIndex) {
      const full = joinSegments(nextSegments);
      if (full && !isCatchAll(full)) out.add(full);
    }
    if (children) collectFromArray(children, nextSegments, out);
  }
}

function joinSegments(segments: string[]): string {
  // Allow absolute children: any segment starting with "/" resets the chain
  let acc: string[] = [];
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.startsWith("/")) acc = [seg.replace(/^\/+/, "")];
    else acc.push(seg);
  }
  const joined = "/" + acc.filter(Boolean).join("/").replace(/\/+/g, "/");
  return joined === "/" ? "/" : joined.replace(/\/$/, "");
}
