import { chromium, type Browser } from "playwright";
import type { SpideyTile, SpideyNode } from "@spidey/shared";
import { log } from "./util.js";

const VIEWPORT = { width: 1280, height: 800 };

export type CaptureTarget = {
  /** Stable id for the resulting tile */
  id: string;
  /** URL relative to the dev server, including a leading slash */
  url: string;
  /** Human-friendly label printed in logs */
  label: string;
  /** Extra fields merged onto the SpideyTile; lets the caller tag a tile as
   *  a route or component without capture having to know the schema. */
  meta: Partial<SpideyTile>;
};

export type CaptureOptions = {
  baseUrl: string;
  targets: CaptureTarget[];
};

export async function captureAll({
  baseUrl,
  targets,
}: CaptureOptions): Promise<{ tiles: SpideyTile[]; viewport: typeof VIEWPORT }> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e: any) {
    throw new Error(
      `Failed to launch Chromium. You may need to run:\n  bunx playwright install chromium\n\nOriginal: ${e?.message ?? e}`,
    );
  }
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const out: SpideyTile[] = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const url = baseUrl.replace(/\/$/, "") + t.url;
      log.step(`capturing [${i + 1}/${targets.length}] ${t.label} → ${url}`);

      const page = await ctx.newPage();
      const captured: SpideyTile = {
        id: t.id,
        status: "ok",
        tree: null,
        css: "",
        capturedAt: new Date().toISOString(),
        viewport: VIEWPORT,
        ...t.meta,
      };

      try {
        const response = await page.goto(url, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        if (!response) throw new Error("no response from page.goto");
        if (response.status() >= 400) {
          throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
        }

        await page.waitForTimeout(500);

        captured.title = await page.title();

        // Tag DOM with React component owners + serialize their props,
        // then walk the live DOM into a SpideyNode tree in one
        // page.evaluate so state stays consistent.
        const { tree, css, containerSize, bodyAttrs, htmlAttrs } =
          await page.evaluate(async (tileIdx) => {
          // ----- Component tagging via React fiber walking -----
          (function tagComponents() {
            function getFiber(el: any): any {
              for (const k of Object.keys(el)) {
                if (k.startsWith("__reactFiber$")) return el[k];
              }
              return null;
            }
            function nameOfType(type: any): string | null {
              if (!type) return null;
              if (typeof type === "function") {
                const n = type.displayName || type.name;
                if (n && /^[A-Z]/.test(n)) return n;
                return null;
              }
              if (typeof type === "object") {
                if (type.displayName && /^[A-Z]/.test(type.displayName))
                  return type.displayName;
                // memo: type.type is the inner component; forwardRef: type.render
                // is the inner render. Try both, plus $$id (RSC client refs)
                // last-segment as a fallback so server→client boundaries
                // surface as a name.
                const inner =
                  nameOfType(type.type) ??
                  nameOfType(type.render);
                if (inner) return inner;
                if (typeof type.$$id === "string") {
                  const id: string = type.$$id;
                  // "/path/Button.js#default" → "Button"; "...#Button" → "Button"
                  const hash = id.lastIndexOf("#");
                  const fileBit = hash >= 0 ? id.slice(0, hash) : id;
                  const exportBit = hash >= 0 ? id.slice(hash + 1) : "";
                  if (exportBit && exportBit !== "default" && /^[A-Z]/.test(exportBit))
                    return exportBit;
                  const base = (fileBit.split("/").pop() || "").replace(/\.[a-z]+$/i, "");
                  if (base && /^[A-Z]/.test(base)) return base;
                }
              }
              return null;
            }
            function nearestComponentFiber(fiber: any): any {
              let f = fiber;
              while (f) {
                const n = nameOfType(f.type);
                if (n) return f;
                f = f.return;
              }
              return null;
            }
            function firstHostDescendant(fiber: any): any {
              let f = fiber.child;
              while (f) {
                if (f.stateNode instanceof Element) return f;
                if (f.child) {
                  f = f.child;
                  continue;
                }
                if (f.sibling) {
                  f = f.sibling;
                  continue;
                }
                while (f && !f.sibling) f = f.return;
                if (!f || f === fiber) return null;
                f = f.sibling;
              }
              return null;
            }
            // Best-effort serialization of runtime props for the props
            // panel in the viewer. Functions, JSX elements, and big
            // collections are dropped — we only want lightweight
            // primitives and small object/array shapes for display.
            function serializeProps(props: any, depth = 0): any {
              if (props === null || props === undefined) return null;
              if (depth > 3) return undefined;
              const type = typeof props;
              if (type === "string" || type === "number" || type === "boolean")
                return props;
              if (type === "function") return undefined;
              if (Array.isArray(props)) {
                const out: any[] = [];
                for (let i = 0; i < Math.min(props.length, 10); i++) {
                  const v = serializeProps(props[i], depth + 1);
                  if (v !== undefined) out.push(v);
                }
                return out;
              }
              if (type === "object") {
                // React elements have $$typeof Symbol — skip them
                if (props.$$typeof) return undefined;
                const out: Record<string, any> = {};
                for (const key of Object.keys(props)) {
                  if (key === "children") continue;
                  const v = serializeProps(props[key], depth + 1);
                  if (v !== undefined) out[key] = v;
                }
                return out;
              }
              return undefined;
            }
            const seen = new Set<any>();
            const all = document.body?.querySelectorAll("*") ?? [];
            for (const el of Array.from(all) as Element[]) {
              const fiber = getFiber(el);
              if (!fiber) continue;
              const compFiber = nearestComponentFiber(fiber);
              if (!compFiber || seen.has(compFiber)) continue;
              seen.add(compFiber);
              const host = firstHostDescendant(compFiber);
              const name = nameOfType(compFiber.type);
              if (host?.stateNode instanceof Element && name) {
                host.stateNode.setAttribute("data-spidey-component", name);
                const propsSnap = serializeProps(compFiber.memoizedProps);
                if (propsSnap && Object.keys(propsSnap).length > 0) {
                  try {
                    host.stateNode.setAttribute(
                      "data-spidey-props",
                      JSON.stringify(propsSnap),
                    );
                  } catch {
                    // ignore unserializable
                  }
                }
              }
            }
          })();

          // ----- Natural-size measurement -----
          // For component previews: dimensions of the wrapper div so the
          // tile fits the component snugly. For routes: documentElement's
          // scrollHeight so long pages get a tile tall enough to show all
          // of their content (no clipping at viewport.height).
          let measuredSize: { width: number; height: number } | undefined;
          const previewRoot = document.querySelector(
            "[data-spidey-component-root]",
          );
          if (previewRoot instanceof HTMLElement) {
            const r = previewRoot.getBoundingClientRect();
            measuredSize = {
              width: Math.max(1, Math.ceil(r.width)),
              height: Math.max(1, Math.ceil(r.height)),
            };
          } else if (document.documentElement) {
            const docH = Math.max(
              document.documentElement.scrollHeight,
              document.body?.scrollHeight ?? 0,
            );
            const docW = Math.max(
              document.documentElement.scrollWidth,
              document.body?.scrollWidth ?? 0,
            );
            measuredSize = {
              width: Math.max(1, Math.ceil(docW)),
              height: Math.max(1, Math.ceil(docH)),
            };
          }

          // ----- Capture <body> and <html> attributes -----
          // The viewer mounts captured content inside a shadow root, where
          // the real <body> / <html> elements don't exist. We synthesize
          // them and apply these attributes so theming selectors like
          // `body.dark` or `html[data-theme="dark"]` keep matching.
          function safeAttrs(el: Element | null): Record<string, string> {
            const out: Record<string, string> = {};
            if (!el) return out;
            for (const a of Array.from(el.attributes)) {
              const name = a.name.toLowerCase();
              if (name.startsWith("on")) continue;
              out[a.name] = a.value;
            }
            return out;
          }
          const bodyAttrs = safeAttrs(document.body);
          const htmlAttrs = safeAttrs(document.documentElement);

          // ----- CSS extraction -----
          const cssChunks: string[] = [];
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              const rules = sheet.cssRules;
              if (!rules) continue;
              for (let i = 0; i < rules.length; i++) {
                cssChunks.push(rules[i].cssText);
              }
            } catch {
              const href = (sheet as CSSStyleSheet).href;
              if (href) {
                try {
                  const r = await fetch(href);
                  if (r.ok) cssChunks.push(await r.text());
                } catch {
                  // ignore
                }
              }
            }
          }

          // ----- DOM → SpideyNode tree -----
          const SKIP = new Set([
            "script",
            "style",
            "link",
            "meta",
            "noscript",
            "template",
          ]);
          let counter = 0;
          const nextId = () => `t${tileIdx}-n${counter++}`;

          // Capture viewport — used as the basis for vh/vw → px rewriting
          // below. We freeze the captured page at this viewport (1280×800)
          // so pages with `100vh` heroes etc. don't blow up to the user's
          // browser-window height in the viewer.
          const VW = 1280;
          const VH = 800;

          function rewriteViewportUnits(s: string): string {
            if (!s) return s;
            return s.replace(
              /(-?\d+(?:\.\d+)?)(vh|svh|lvh|dvh|vw|svw|lvw|dvw|vmin|vmax)\b/gi,
              (_m, num, unit) => {
                const n = parseFloat(num);
                const u = unit.toLowerCase();
                let basis: number;
                if (u.endsWith("vh")) basis = VH;
                else if (u.endsWith("vw")) basis = VW;
                else if (u === "vmin") basis = Math.min(VW, VH);
                else if (u === "vmax") basis = Math.max(VW, VH);
                else basis = VH;
                return `${(n * basis) / 100}px`;
              },
            );
          }

          function parseInlineStyle(s: string): Record<string, string> {
            const out: Record<string, string> = {};
            if (!s) return out;
            for (const decl of s.split(";")) {
              const colon = decl.indexOf(":");
              if (colon < 0) continue;
              const k = decl.slice(0, colon).trim();
              const v = decl.slice(colon + 1).trim();
              if (k) out[k] = rewriteViewportUnits(v);
            }
            return out;
          }

          function buildNode(el: Element): any {
            const tag = el.tagName.toLowerCase();
            if (SKIP.has(tag)) return null;

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
                style = parseInlineStyle(a.value);
                continue;
              }
              attrs[a.name] = a.value;
            }

            const children: any[] = [];
            for (const child of Array.from(el.childNodes)) {
              if (child.nodeType === 3) {
                // text node
                const text = (child.textContent ?? "");
                // Preserve whitespace inside <pre>/<code>; for everything
                // else, drop pure-whitespace text nodes.
                const isPre = tag === "pre" || tag === "code";
                if (isPre ? text.length > 0 : text.trim()) {
                  children.push({
                    id: nextId(),
                    kind: "text",
                    value: text,
                  });
                }
              } else if (child.nodeType === 1) {
                const n = buildNode(child as Element);
                if (n) children.push(n);
              }
            }

            return {
              id: nextId(),
              kind: "el",
              tag,
              attrs,
              style,
              children,
            };
          }

          // For component previews we drop everything outside the
          // `[data-spidey-component-root]` wrapper — Next's root layout
          // (and any global chrome) lives in the captured body but isn't
          // part of the component, and we don't want it bleeding into
          // the standalone component tile. The wrapper carries its own
          // padding/background so the component still has a sandbox.
          const isPreview =
            previewRoot instanceof Element &&
            document.body?.contains(previewRoot);
          let tree: any = null;
          if (document.body) {
            if (isPreview) {
              const wrapper = buildNode(previewRoot as Element);
              tree = {
                id: nextId(),
                kind: "el",
                tag: "body",
                attrs: {},
                style: {},
                children: wrapper ? [wrapper] : [],
              };
            } else {
              tree = buildNode(document.body);
            }
          }

          return {
            tree,
            css: rewriteViewportUnits(cssChunks.join("\n")),
            containerSize: measuredSize,
            bodyAttrs,
            htmlAttrs,
          };
        }, i);

        captured.tree = tree as SpideyNode | null;
        captured.css = css;
        if (containerSize) captured.containerSize = containerSize;
        if (bodyAttrs && Object.keys(bodyAttrs).length > 0)
          captured.bodyAttrs = bodyAttrs;
        if (htmlAttrs && Object.keys(htmlAttrs).length > 0)
          captured.htmlAttrs = htmlAttrs;
      } catch (e: any) {
        captured.status = "error";
        captured.error = String(e?.message ?? e);
        captured.tree = null;
        log.warn(`  failed: ${captured.error}`);
      } finally {
        await page.close();
      }

      out.push(captured);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }

  return { tiles: out, viewport: VIEWPORT };
}
