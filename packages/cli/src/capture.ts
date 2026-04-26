import { chromium, type Browser } from "playwright";
import type { SpideyPage } from "@spidey/shared";
import { log } from "./util.js";

const VIEWPORT = { width: 1280, height: 800 };

export type CaptureTarget = {
  /** Stable id for the resulting tile */
  id: string;
  /** URL relative to the dev server, including a leading slash */
  url: string;
  /** Human-friendly label printed in logs */
  label: string;
  /** Extra fields merged onto the SpideyPage; lets the caller tag a tile as
   *  a route or component without capture having to know the schema. */
  meta: Partial<SpideyPage>;
};

export type CaptureOptions = {
  baseUrl: string;
  targets: CaptureTarget[];
};

export async function captureAll({
  baseUrl,
  targets,
}: CaptureOptions): Promise<{ pages: SpideyPage[]; viewport: typeof VIEWPORT }> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e: any) {
    throw new Error(
      `Failed to launch Chromium. You may need to run:\n  bunx playwright install chromium\n\nOriginal: ${e?.message ?? e}`,
    );
  }
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const out: SpideyPage[] = [];

  try {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const url = baseUrl.replace(/\/$/, "") + t.url;
      log.step(`capturing [${i + 1}/${targets.length}] ${t.label} → ${url}`);

      const page = await ctx.newPage();
      const captured: SpideyPage = {
        id: t.id,
        status: "ok",
        html: "",
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
        // then capture HTML + CSS in a single page.evaluate to keep state
        // consistent.
        const { html, css, containerSize } = await page.evaluate(async () => {
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
              }
              if (typeof type === "object") {
                if (type.displayName) return type.displayName;
                const inner = nameOfType(type.render ?? type.type);
                if (inner) return inner;
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

          // ----- Natural-size measurement for component previews -----
          let measuredSize: { width: number; height: number } | undefined;
          const previewRoot = document.querySelector(
            "[data-spidey-component-root]",
          );
          if (previewRoot instanceof HTMLElement) {
            const r = previewRoot.getBoundingClientRect();
            // Round up so we don't clip subpixel content.
            measuredSize = {
              width: Math.max(1, Math.ceil(r.width)),
              height: Math.max(1, Math.ceil(r.height)),
            };
          }

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

          // ----- HTML sanitization -----
          const clone = document.body?.cloneNode(true) as HTMLElement | null;
          if (clone) {
            const dropSelectors = "script, style, link, meta, noscript";
            clone.querySelectorAll(dropSelectors).forEach((n) => n.remove());
            const walker = document.createTreeWalker(
              clone,
              NodeFilter.SHOW_ELEMENT,
            );
            let cur: Node | null = walker.currentNode;
            while (cur) {
              if (cur instanceof Element) {
                for (const attr of Array.from(cur.attributes)) {
                  const name = attr.name.toLowerCase();
                  if (name.startsWith("on")) cur.removeAttribute(attr.name);
                  else if (
                    (name === "href" || name === "src" || name === "action") &&
                    /^\s*javascript:/i.test(attr.value)
                  ) {
                    cur.removeAttribute(attr.name);
                  }
                }
              }
              cur = walker.nextNode();
            }
          }

          return {
            html: clone?.innerHTML ?? "",
            css: cssChunks.join("\n"),
            containerSize: measuredSize,
          };
        });

        captured.html = html;
        captured.css = css;
        if (containerSize) captured.containerSize = containerSize;
      } catch (e: any) {
        captured.status = "error";
        captured.error = String(e?.message ?? e);
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

  return { pages: out, viewport: VIEWPORT };
}
