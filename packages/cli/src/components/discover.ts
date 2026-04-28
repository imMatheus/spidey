import path from "node:path";
import fs from "node:fs";
import ts from "typescript";
import type { ComponentSpec, PropSpec } from "./types.js";
import { fileExists, log } from "../util.js";
import {
  findWorkspaceComponentRoots,
  type WorkspacePackage,
} from "./workspace.js";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  ".git",
  // App-level pages/routes are too coupled to data + routing context to
  // render meaningfully as standalone master tiles. The route capture
  // already shows them in their full route context. Skip the directory
  // names that conventionally hold route/page modules.
  "pages",
  "routes",
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
 *
 * In a monorepo, also walks workspace packages declared as `workspace:*`
 * deps in the project's package.json (e.g. shadcn-style `ui` packages).
 * Components from those packages are tagged via `relPath` prefixed with
 * `@workspace/<name>/` so the viewer can show their origin.
 */
export function discoverComponents(root: string): ComponentSpec[] {
  const workspacePackages = findWorkspaceComponentRoots(root);
  if (workspacePackages.length > 0) {
    log.dim(
      `including ${workspacePackages.length} workspace package${workspacePackages.length === 1 ? "" : "s"}: ${workspacePackages.map((w) => w.name).join(", ")}`,
    );
  }
  const allRoots: string[] = [
    root,
    ...workspacePackages.map((w) => w.path),
  ];

  const tsconfigPath = locateTsconfig(root);
  const program = createProgram(root, tsconfigPath, workspacePackages);
  const checker = program.getTypeChecker();
  const out: ComponentSpec[] = [];
  // PascalCase identifiers exported from each file. Includes named-export
  // re-exports (`export { Foo }`) and direct property aliases like
  // `export const Accordion = AccordionPrimitive.Root` — even when the
  // alias isn't itself capturable as a component, knowing it exists lets
  // us identify compound subcomponents (`AccordionItem`, `AccordionContent`)
  // and skip them, since they crash without their root context.
  const exportsByFile = new Map<string, Set<string>>();

  function recordExport(fileName: string, name: string) {
    if (!isComponentName(name)) return;
    let set = exportsByFile.get(fileName);
    if (!set) {
      set = new Set<string>();
      exportsByFile.set(fileName, set);
    }
    set.add(name);
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    const file = sourceFile.fileName;
    if (!file.endsWith(".tsx")) continue;
    const owningRoot = pickOwningRoot(file, allRoots);
    if (!owningRoot) continue;
    if (file.split(path.sep).some((seg) => IGNORE_DIRS.has(seg))) continue;
    if (file.includes(PREVIEW_HINT)) continue;
    if (FRAMEWORK_FILES.has(path.basename(file))) continue;
    const workspacePkg = workspacePackages.find((w) => w.path === owningRoot);
    const relPathFor = (f: string) =>
      workspacePkg
        ? `@workspace/${workspacePkg.name}/${path.relative(workspacePkg.path, f)}`
        : path.relative(root, f);

    collectExports(sourceFile, file);
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
          relPath: relPathFor(file),
          exportKind: isDefault ? "default" : "named",
          propsName: getParamTypeName(stmt.parameters[0]),
          props,
        });
        return;
      }

      // export const Foo = (props) => <jsx>
      // export const Foo: FC<T> = (props) => <jsx>
      // export const Foo = forwardRef<E, P>((props, ref) => <jsx>)
      // export const Foo = memo((props) => <jsx>)
      // export const Foo = SomeNS.Root  — Radix-style root alias
      if (ts.isVariableStatement(stmt)) {
        const isExport = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
        if (!isExport) return;
        for (const decl of stmt.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) continue;
          const name = decl.name.text;
          if (!isComponentName(name)) continue;
          const init = decl.initializer;
          if (!init) continue;
          const fn = unwrapToFunction(init);
          if (fn) {
            if (!returnsJsx(fn)) continue;
            const props = extractPropsFromParam(fn.parameters[0], checker);
            out.push({
              name,
              file,
              relPath: relPathFor(file),
              exportKind: "named",
              propsName: getParamTypeName(fn.parameters[0]),
              props,
            });
            continue;
          }
          // Radix root alias pattern: `const Accordion = AccordionPrimitive.Root`.
          // We can't walk a function body, so we ask the type checker whether
          // the alias resolves to a callable (component). If yes, emit it
          // with empty-ish props extracted from the call signature's first
          // parameter — that's enough to put a tile on the canvas and let
          // the harness pass {} (which most Radix Roots accept).
          const aliased = aliasedComponentInit(init);
          if (!aliased) continue;
          const sig = firstComponentCallSignature(aliased, checker);
          if (!sig) continue;
          const param = sig.getParameters()[0];
          let aliasProps: Record<string, PropSpec> = {};
          let propsTypeName: string | undefined;
          if (param) {
            const paramDecl =
              param.valueDeclaration ?? param.declarations?.[0];
            if (paramDecl) {
              const paramType = checker.getTypeOfSymbolAtLocation(
                param,
                paramDecl,
              );
              aliasProps = typeToObjectProps(paramType, checker, 0);
            }
          }
          out.push({
            name,
            file,
            relPath: relPathFor(file),
            exportKind: "named",
            propsName: propsTypeName,
            props: aliasProps,
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

      // export { Foo, Bar } — re-export of locally declared identifiers.
      // Common in shadcn/Radix wrappers: the component is a `const Foo = ...`
      // earlier in the file and gets exported at the bottom. Without this
      // branch we'd miss every forwardRef-wrapped component in those libs.
      if (
        ts.isExportDeclaration(stmt) &&
        stmt.exportClause &&
        ts.isNamedExports(stmt.exportClause) &&
        !stmt.moduleSpecifier
      ) {
        for (const spec of stmt.exportClause.elements) {
          const exportedName = spec.name.text;
          if (!isComponentName(exportedName)) continue;
          // The locally-bound name (the `Foo` in `Foo as default`)
          const localName = (spec.propertyName ?? spec.name).text;
          // Already captured under that exported name?
          if (out.some((c) => c.file === file && c.name === exportedName))
            continue;
          // Find the local declaration in this source file.
          const found = findLocalComponent(sourceFile, localName, checker);
          if (!found) continue;
          out.push({
            name: exportedName,
            file,
            relPath: relPathFor(file),
            exportKind: "named",
            propsName: found.propsName,
            props: found.props,
          });
        }
      }
    }

    // Walk export-bearing statements once for the file-exports map. We
    // intentionally repeat the structural checks rather than fold this
    // into walkStatement because the export map needs to see *every*
    // exported PascalCase name (including ones that don't render JSX,
    // like `Accordion = AccordionPrimitive.Root`), while walkStatement
    // only emits things it can actually capture.
    function collectExports(sf: ts.SourceFile, fileName: string) {
      for (const stmt of sf.statements) {
        if (
          ts.isFunctionDeclaration(stmt) &&
          hasModifier(stmt, ts.SyntaxKind.ExportKeyword) &&
          stmt.name?.text
        ) {
          recordExport(fileName, stmt.name.text);
        } else if (
          ts.isVariableStatement(stmt) &&
          hasModifier(stmt, ts.SyntaxKind.ExportKeyword)
        ) {
          for (const decl of stmt.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              recordExport(fileName, decl.name.text);
            }
          }
        } else if (ts.isClassDeclaration(stmt) && stmt.name) {
          if (hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
            recordExport(fileName, stmt.name.text);
          }
        } else if (
          ts.isExportDeclaration(stmt) &&
          stmt.exportClause &&
          ts.isNamedExports(stmt.exportClause)
        ) {
          for (const spec of stmt.exportClause.elements) {
            recordExport(fileName, spec.name.text);
          }
        }
      }
    }
  }

  // Compound-subcomponent filter (root-cause fix for the Radix/shadcn
  // pattern). When a file exports `Foo` AND `FooBar`/`FooBaz`/etc., the
  // latter are subcomponents that throw at runtime when rendered without
  // their root (`AccordionItem` outside `<Accordion>`, `AlertDialogContent`
  // outside `<AlertDialog>`, …). Drop them from the master-tile list — the
  // root component is the standalone-meaningful one.
  const filtered = out.filter((c) => {
    const exports = exportsByFile.get(c.file);
    if (!exports || exports.size <= 1) return true;
    for (const other of exports) {
      if (other === c.name) continue;
      if (
        c.name.startsWith(other) &&
        c.name.length > other.length &&
        // Require the next char to be uppercase so we don't drop
        // unrelated names like `Buttonish` when `Button` exists.
        /[A-Z]/.test(c.name.charAt(other.length))
      ) {
        return false;
      }
    }
    return true;
  });

  return dedupe(filtered);
}

function locateTsconfig(root: string): string {
  const candidates = ["tsconfig.json", "tsconfig.app.json"];
  for (const c of candidates) {
    const p = path.join(root, c);
    if (fileExists(p)) return p;
  }
  return path.join(root, "tsconfig.json"); // may not exist; we fall back below
}

function createProgram(
  root: string,
  tsconfigPath: string,
  workspacePackages: WorkspacePackage[],
): ts.Program {
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

  // Add .tsx files from each workspace package the project depends on so
  // those components are visible to the type checker (and also so they
  // surface in the program's source files for the discovery loop).
  for (const wp of workspacePackages) {
    const wpFiles = walkTsxFiles(wp.path);
    for (const f of wpFiles) rootNames.push(f);
  }

  return ts.createProgram(rootNames, options);
}

/**
 * Return the root (project or workspace package) that contains `file`, or
 * null if the file is outside every known root. Picks the most-specific
 * root when multiple match (longest prefix wins).
 */
function pickOwningRoot(file: string, roots: string[]): string | null {
  let best: string | null = null;
  for (const r of roots) {
    if (file.startsWith(r + path.sep) || file === r) {
      if (best === null || r.length > best.length) best = r;
    }
  }
  return best;
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

/**
 * Names of higher-order component wrappers that take a render fn and
 * return a component. We unwrap their first argument and treat that as the
 * actual component body for prop extraction. Without this the Radix /
 * shadcn / supabase-ui patterns (`export const Button = forwardRef(...)`)
 * don't surface as discoverable components.
 */
const COMPONENT_WRAPPERS = new Set([
  "forwardRef",
  "memo",
  "observer", // mobx
]);

/**
 * Look up a non-exported, top-level component declaration by its local
 * name. Returns its prop shape, mirroring what `walkStatement` would have
 * produced if the declaration had been directly exported. Used to wire up
 * `export { Foo }`-style re-exports.
 */
function findLocalComponent(
  sourceFile: ts.SourceFile,
  name: string,
  checker: ts.TypeChecker,
): { propsName: string | undefined; props: Record<string, PropSpec> } | null {
  for (const stmt of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(stmt) &&
      stmt.name?.text === name &&
      returnsJsx(stmt)
    ) {
      return {
        propsName: getParamTypeName(stmt.parameters[0]),
        props: extractPropsFromParam(stmt.parameters[0], checker),
      };
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue;
        if (!decl.initializer) continue;
        const fn = unwrapToFunction(decl.initializer);
        if (fn && returnsJsx(fn)) {
          return {
            propsName: getParamTypeName(fn.parameters[0]),
            props: extractPropsFromParam(fn.parameters[0], checker),
          };
        }
        // Radix root alias: `const Accordion = AccordionPrimitive.Root`.
        // The decl.initializer is a PropertyAccessExpression whose type
        // resolves to a React component. Emit with the call signature's
        // parameter shape.
        const aliased = aliasedComponentInit(decl.initializer);
        if (!aliased) continue;
        const sig = firstComponentCallSignature(aliased, checker);
        if (!sig) continue;
        const param = sig.getParameters()[0];
        if (!param) return { propsName: undefined, props: {} };
        const paramDecl =
          param.valueDeclaration ?? param.declarations?.[0];
        if (!paramDecl) return { propsName: undefined, props: {} };
        const paramType = checker.getTypeOfSymbolAtLocation(
          param,
          paramDecl,
        );
        return {
          propsName: undefined,
          props: typeToObjectProps(paramType, checker, 0),
        };
      }
    }
  }
  return null;
}

/**
 * Detect a "component alias" initializer — a property access or identifier
 * that points at a React component declared elsewhere. Common in Radix
 * compound roots: `const Accordion = AccordionPrimitive.Root`. Returns the
 * underlying expression for the type checker, or null if the shape doesn't
 * look like an alias.
 *
 * We don't try to resolve through complex expressions (calls, type
 * assertions, etc.) — just the two patterns that account for nearly all
 * shadcn-style root aliases.
 */
function aliasedComponentInit(node: ts.Expression): ts.Expression | null {
  if (ts.isPropertyAccessExpression(node)) return node;
  if (ts.isIdentifier(node)) return node;
  return null;
}

/**
 * Get the first call signature on a value's type that *looks* like a React
 * component (i.e. takes 0–1 args and returns something React-renderable).
 * Returns null if the type isn't callable in a component-shaped way.
 *
 * Used by alias discovery to emit Radix `*.Root` exports as component
 * specs without needing a function literal to walk.
 */
function firstComponentCallSignature(
  expr: ts.Expression,
  checker: ts.TypeChecker,
): ts.Signature | null {
  const type = checker.getTypeAtLocation(expr);
  // Two parameters is fine: React's `FunctionComponent` typing has the
  // legacy-context parameter in slot 2 (`(props, deprecatedLegacyContext)`).
  // We only ever read the first parameter, so signatures with > 2 are
  // suspicious (probably not component-shaped) but 1 or 2 is normal.
  for (const sig of type.getCallSignatures()) {
    if (sig.getParameters().length > 2) continue;
    return sig;
  }
  return null;
}

/**
 * Walk through HOC wrappers (forwardRef, memo, …) until we find the
 * function literal that returns JSX. Returns null if the argument chain
 * doesn't resolve to one.
 */
function unwrapToFunction(
  node: ts.Expression,
): ts.ArrowFunction | ts.FunctionExpression | null {
  let cur: ts.Expression | undefined = node;
  for (let i = 0; i < 4 && cur; i++) {
    if (ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isAsExpression(cur) || ts.isTypeAssertionExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      return cur;
    }
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name)
          ? callee.name.text
          : null;
      if (!calleeName || !COMPONENT_WRAPPERS.has(calleeName)) return null;
      cur = cur.arguments[0];
      continue;
    }
    return null;
  }
  return null;
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

  // Intersection — common pattern in React typings is a literal-union
  // intersected with `string & {}` (autocomplete-friendly fallback). If any
  // member is a primitive, surface as that primitive kind so we don't end
  // up walking String.prototype as if it were object fields.
  if (type.isIntersection()) {
    for (const t of type.types) {
      const tf = t.getFlags();
      if (tf & ts.TypeFlags.String) return { kind: "string", optional };
      if (tf & ts.TypeFlags.Number) return { kind: "number", optional };
      if (tf & ts.TypeFlags.Boolean) return { kind: "boolean", optional };
    }
  }

  // Assignability fallback — catches `string & {}` patterns and other
  // primitive-derived types whose `getProperties()` would be the boxed
  // wrapper's methods (toString, charAt, …). Without this, `role`,
  // `htmlInputTypeAttribute`, `AriaRole` etc. become bogus objects with
  // function-shaped fields, then crash render with
  // "Cannot convert object to primitive value".
  const stringType = (checker as any).getStringType?.();
  const numberType = (checker as any).getNumberType?.();
  const boolType = (checker as any).getBooleanType?.();
  if (stringType && checker.isTypeAssignableTo(type, stringType)) {
    return { kind: "string", optional };
  }
  if (numberType && checker.isTypeAssignableTo(type, numberType)) {
    return { kind: "number", optional };
  }
  if (boolType && checker.isTypeAssignableTo(type, boolType)) {
    return { kind: "boolean", optional };
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
