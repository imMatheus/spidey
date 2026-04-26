import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
import type { ComponentSpec, PropSpec } from "./types.js";
import { fileExists, log } from "../util.js";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".git",
]);

/** Substring match used to ignore our own auto-generated preview files. */
const PREVIEW_HINT = "spidey_preview";

/**
 * File-name patterns we treat as "framework routing files" — those define
 * routes/layouts/loading/error UI in Next App Router and are not meant to
 * be rendered standalone with faker props. Filtering these matches the
 * user's mental model of "discoverable component" (= reusable UI in
 * components/ etc., not page-level scaffolding).
 */
const FRAMEWORK_FILES = new Set([
  "page.tsx",
  "page.ts",
  "layout.tsx",
  "layout.ts",
  "loading.tsx",
  "error.tsx",
  "not-found.tsx",
  "template.tsx",
  "default.tsx",
  "route.tsx",
  "route.ts",
  // Vite entry points
  "main.tsx",
  "main.ts",
  "index.tsx",
  // root of CRA-style projects
]);

/**
 * Discover React components in a TypeScript project using the official
 * Compiler API. Looks at every top-level function/const declaration in
 * `.tsx` files, picks ones that look like React components (capitalized
 * name, returns JSX), and walks the prop type to a serializable PropSpec.
 */
export function discoverComponents(root: string): ComponentSpec[] {
  const tsconfigPath = locateTsconfig(root);
  const program = createProgram(root, tsconfigPath);
  const checker = program.getTypeChecker();
  const out: ComponentSpec[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const file = sourceFile.fileName;
    if (!file.endsWith(".tsx")) continue;
    if (!file.startsWith(root)) continue;
    if (file.split(path.sep).some((seg) => IGNORE_DIRS.has(seg))) continue;
    if (file.includes(PREVIEW_HINT)) continue;
    if (FRAMEWORK_FILES.has(path.basename(file))) continue;

    visit(sourceFile);

    function visit(node: ts.Node) {
      // Only walk the file's top-level statements
      if (node === sourceFile) {
        sourceFile.statements.forEach(walkStatement);
      }
    }

    function walkStatement(stmt: ts.Statement) {
      // export default function Foo(props) {}
      if (ts.isFunctionDeclaration(stmt)) {
        const isExport = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
        const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);
        const name = stmt.name?.text;
        if (!name) return;
        if (!isComponentName(name)) return;
        if (!returnsJsx(stmt)) return;
        if (!isExport) return;
        const props = extractPropsFromParam(stmt.parameters[0], checker);
        out.push({
          name,
          file,
          relPath: path.relative(root, file),
          exportKind: isDefault ? "default" : "named",
          propsName: getParamTypeName(stmt.parameters[0]),
          props,
        });
        return;
      }

      // export const Foo = (props) => <jsx>
      // export const Foo: FC<T> = (props) => <jsx>
      if (ts.isVariableStatement(stmt)) {
        const isExport = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
        if (!isExport) return;
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const name = decl.name.text;
          if (!isComponentName(name)) continue;
          const init = decl.initializer;
          if (!init) continue;
          if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init))
            continue;
          if (!returnsJsx(init)) continue;
          const props = extractPropsFromParam(init.parameters[0], checker);
          out.push({
            name,
            file,
            relPath: path.relative(root, file),
            exportKind: "named",
            propsName: getParamTypeName(init.parameters[0]),
            props,
          });
        }
      }

      // export default Foo  (where Foo is defined above)
      if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
        if (ts.isIdentifier(stmt.expression)) {
          const name = stmt.expression.text;
          if (!isComponentName(name)) return;
          // Ensure we already captured this; otherwise we look it up.
          const existing = out.find(
            (c) => c.file === file && c.name === name,
          );
          if (existing) existing.exportKind = "default";
        }
      }
    }
  }

  return dedupe(out);
}

function locateTsconfig(root: string): string {
  const candidates = ["tsconfig.json", "tsconfig.app.json"];
  for (const c of candidates) {
    const p = path.join(root, c);
    if (fileExists(p)) return p;
  }
  return path.join(root, "tsconfig.json"); // may not exist; we fall back below
}

function createProgram(root: string, tsconfigPath: string): ts.Program {
  let options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    strict: false,
    noEmit: true,
    skipLibCheck: true,
  };
  let rootNames: string[] = [];

  if (fileExists(tsconfigPath)) {
    const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (cfg.config) {
      const parsed = ts.parseJsonConfigFileContent(
        cfg.config,
        ts.sys,
        path.dirname(tsconfigPath),
      );
      options = { ...options, ...parsed.options, noEmit: true };
      rootNames = parsed.fileNames.filter(
        (f) =>
          !f.includes("node_modules") &&
          !f.includes(PREVIEW_HINT),
      );
    }
  }

  if (rootNames.length === 0) {
    rootNames = walkTsxFiles(root);
  }

  return ts.createProgram(rootNames, options);
}

function walkTsxFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && (e.name.endsWith(".tsx") || e.name.endsWith(".ts")))
        out.push(full);
    }
  }
  return out;
}

function hasModifier(
  node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> },
  kind: ts.SyntaxKind,
): boolean {
  return (node.modifiers ?? []).some((m) => m.kind === kind);
}

function isComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

function returnsJsx(
  node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
): boolean {
  // Arrow with expression body
  if (
    ts.isArrowFunction(node) &&
    node.body &&
    !ts.isBlock(node.body) &&
    isJsxLike(node.body)
  ) {
    return true;
  }
  if (!node.body || !ts.isBlock(node.body)) return false;
  let found = false;
  function visit(n: ts.Node) {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression && isJsxLike(n.expression)) {
      found = true;
      return;
    }
    // Skip nested function bodies
    if (
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n)
    ) {
      return;
    }
    ts.forEachChild(n, visit);
  }
  ts.forEachChild(node.body, visit);
  return found;
}

function isJsxLike(node: ts.Node): boolean {
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  )
    return true;
  // (<jsx />)
  if (ts.isParenthesizedExpression(node)) return isJsxLike(node.expression);
  // null is also a valid component return — but we want components that have
  // visible output, so we don't count nulls.
  return false;
}

function getParamTypeName(param: ts.ParameterDeclaration | undefined): string | undefined {
  const t = param?.type;
  if (!t) return undefined;
  if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName))
    return t.typeName.text;
  return undefined;
}

function extractPropsFromParam(
  param: ts.ParameterDeclaration | undefined,
  checker: ts.TypeChecker,
): Record<string, PropSpec> {
  if (!param) return {};
  const type = checker.getTypeAtLocation(param);
  return typeToObjectProps(type, checker, 0);
}

const MAX_DEPTH = 4;

function typeToObjectProps(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth: number,
): Record<string, PropSpec> {
  const out: Record<string, PropSpec> = {};
  for (const sym of type.getProperties()) {
    const declaration = sym.valueDeclaration ?? sym.declarations?.[0];
    if (!declaration) continue;
    const sub = checker.getTypeOfSymbolAtLocation(sym, declaration);
    const optional = (sym.flags & ts.SymbolFlags.Optional) !== 0;
    out[sym.name] = typeToSpec(sub, checker, depth + 1, optional);
  }
  return out;
}

function typeToSpec(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth: number,
  optional: boolean,
): PropSpec {
  if (depth > MAX_DEPTH) return { kind: "unknown", optional };

  const flags = type.getFlags();

  // ReactNode-ish: surface as "node" so faker can supply a children string.
  const sym = type.getSymbol() ?? type.aliasSymbol;
  const symName = sym?.getName();
  if (
    symName === "ReactNode" ||
    symName === "ReactElement" ||
    symName === "JSX.Element"
  ) {
    return { kind: "node", optional };
  }

  // Function (call signature present and no construct signature)
  if (type.getCallSignatures().length > 0 && !type.getConstructSignatures().length) {
    return { kind: "function", optional };
  }

  // Primitives
  if (flags & ts.TypeFlags.String) return { kind: "string", optional };
  if (flags & ts.TypeFlags.Number) return { kind: "number", optional };
  if (flags & ts.TypeFlags.Boolean) return { kind: "boolean", optional };

  // String / number literal
  if (type.isStringLiteral())
    return { kind: "literal", value: type.value, optional };
  if (type.isNumberLiteral())
    return { kind: "literal", value: type.value, optional };
  if (flags & ts.TypeFlags.BooleanLiteral) {
    const intrinsic = (type as any).intrinsicName;
    return {
      kind: "literal",
      value: intrinsic === "true",
      optional,
    };
  }

  // Union: filter undefined/null. If all literals → enum. Else first usable.
  if (type.isUnion()) {
    const usable = type.types.filter(
      (t) =>
        !(t.getFlags() & ts.TypeFlags.Undefined) &&
        !(t.getFlags() & ts.TypeFlags.Null) &&
        !(t.getFlags() & ts.TypeFlags.Void),
    );
    const allLiterals = usable.every(
      (t) =>
        t.isStringLiteral() ||
        t.isNumberLiteral() ||
        t.getFlags() & ts.TypeFlags.BooleanLiteral,
    );
    if (allLiterals && usable.length > 0) {
      const values = usable.map((t) => {
        if (t.isStringLiteral()) return t.value;
        if (t.isNumberLiteral()) return t.value;
        return (t as any).intrinsicName === "true";
      });
      return { kind: "enum", values, optional };
    }
    if (usable.length === 0) return { kind: "unknown", optional };
    return typeToSpec(usable[0], checker, depth, optional);
  }

  // Array (T[] or Array<T>)
  const elementType = arrayElementType(type, checker);
  if (elementType) {
    return {
      kind: "array",
      of: typeToSpec(elementType, checker, depth + 1, false),
      optional,
    };
  }

  // Object
  if (type.getProperties().length > 0) {
    return {
      kind: "object",
      fields: typeToObjectProps(type, checker, depth + 1),
      optional,
    };
  }

  return { kind: "unknown", optional };
}

function arrayElementType(
  type: ts.Type,
  checker: ts.TypeChecker,
): ts.Type | null {
  const sym = type.getSymbol();
  if (sym?.getName() === "Array" || sym?.getName() === "ReadonlyArray") {
    const args = (type as any).typeArguments ??
      (checker as any).getTypeArguments?.(type);
    if (args && args[0]) return args[0];
  }
  // Tuples / generic arrays via index info
  const numIndex = (checker as any).getIndexTypeOfType?.(type, 1 /* number */);
  if (numIndex && (type as any).symbol?.escapedName === "Array")
    return numIndex;
  return null;
}

function dedupe(items: ComponentSpec[]): ComponentSpec[] {
  const seen = new Map<string, ComponentSpec>();
  for (const it of items) {
    const key = `${it.file}::${it.name}`;
    seen.set(key, it);
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Surface a quick summary. Used by generate.ts. */
export function describeComponents(items: ComponentSpec[]): void {
  for (const c of items) {
    const propStr = Object.entries(c.props)
      .map(([k, v]) => `${k}${v.optional ? "?" : ""}: ${specSummary(v)}`)
      .join(", ");
    log.dim(`${c.name}  ${c.relPath}  (${propStr || "no props"})`);
  }
}

function specSummary(p: PropSpec): string {
  switch (p.kind) {
    case "literal":
      return JSON.stringify(p.value);
    case "enum":
      return p.values.map((v) => JSON.stringify(v)).join(" | ");
    case "array":
      return `${specSummary(p.of)}[]`;
    case "object":
      return "{...}";
    case "function":
      return "fn";
    case "node":
      return "node";
    default:
      return p.kind;
  }
}
