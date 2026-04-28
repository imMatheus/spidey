import { chromium, type Browser, type Page, type Response } from "playwright";
import type { SpideyTile, SpideyNode } from "@spidey/shared";
import { log, sleep } from "./util.js";

const VIEWPORT = { width: 1280, height: 800 };

const GOTO_TIMEOUT_MS = 60_000;
const TRANSIENT_PATTERNS = [
  /ERR_CONNECTION_REFUSED/,
  /ERR_EMPTY_RESPONSE/,
  /ERR_CONNECTION_RESET/,
  /ECONNREFUSED/,
  /ECONNRESET/,
  /Timeout \d+ms exceeded/,
];

/**
 * Goto with one retry on transient errors. Heavy dev servers (Next.js
 * compiling a complex page on first request) sometimes drop the connection
 * mid-compile or return ECONNREFUSED if the previous request stalled them.
 * A short pause + one retry recovers most of these without changing the
 * happy-path latency.
 */
/**
 * Cheap probe of a base URL — returns true if anything answers within 3s.
 * Used to distinguish "dev server is just slow" from "dev server is dead"
 * after a goto failure.
 */
async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3_000);
    try {
      const res = await fetch(baseUrl, { method: "GET", signal: ctl.signal });
      return res.status > 0;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return false;
  }
}

async function gotoWithRetry(page: Page, url: string): Promise<Response | null> {
  try {
    return await page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT_MS });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const transient = TRANSIENT_PATTERNS.some((re) => re.test(msg));
    if (!transient) throw e;
    await sleep(2_000);
    return await page.goto(url, { waitUntil: "load", timeout: GOTO_TIMEOUT_MS });
  }
}

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
  /** Optional pre-launched browser. When provided, captureAll does not
   *  close it on exit — caller owns the lifecycle. Used by the view
   *  server's recapture path so we don't pay browser-cold-start on
   *  every prop edit. */
  browser?: Browser;
  /** Called after each tile is captured. Lets the caller persist progress
   *  incrementally so a long run can be inspected mid-flight or recover
   *  from a crash without losing what's already been captured. */
  onTile?: (tile: SpideyTile, allSoFar: SpideyTile[]) => void | Promise<void>;
  /** Called when capture detects the dev server has stopped responding
   *  (e.g. crashed under memory pressure). Should restart the dev server
   *  and return its new base URL. If omitted, capture marks the remaining
   *  tiles as errors and continues. */
  onDevServerDeath?: () => Promise<string>;
};

export async function captureAll({
  baseUrl,
  targets,
  browser: externalBrowser,
  onTile,
  onDevServerDeath,
}: CaptureOptions): Promise<{ tiles: SpideyTile[]; viewport: typeof VIEWPORT }> {
  let browser: Browser | null = externalBrowser ?? null;
  const ownsBrowser = !externalBrowser;
  if (!browser) {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e: any) {
      throw new Error(
        `Failed to launch Chromium. You may need to run:\n  bunx playwright install chromium\n\nOriginal: ${e?.message ?? e}`,
      );
    }
  }
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const out: SpideyTile[] = [];

  // Mutable so we can swap in a new dev-server URL after a restart.
  let currentBaseUrl = baseUrl;

  try {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const url = currentBaseUrl.replace(/\/$/, "") + t.url;
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
        // `load` (not `networkidle`) for goto — dev-server HMR sockets,
        // analytics beacons, Sentry, posthog and similar long-poll
        // connections keep `networkidle` from ever firing on real apps,
        // so we wait only for the load event and then settle explicitly.
        // 60s timeout because Next.js dev mode can take ~30s on the first
        // compile of a heavy route.
        let response: Response | null;
        try {
          response = await gotoWithRetry(page, url);
        } catch (gotoErr: any) {
          // Connection-refused / empty-response after retry usually means
          // the dev server crashed (typically OOM under heavy compile
          // load). Probe the base URL; if dead, ask the caller to restart
          // and retry the goto once against the new URL.
          const msg = String(gotoErr?.message ?? gotoErr);
          const looksDead =
            /ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/.test(
              msg,
            );
          if (looksDead && onDevServerDeath) {
            const alive = await isReachable(currentBaseUrl);
            if (!alive) {
              log.warn(
                `dev server appears dead (${msg.split("\n")[0]}); restarting…`,
              );
              try {
                currentBaseUrl = await onDevServerDeath();
              } catch (restartErr: any) {
                throw new Error(
                  `dev server restart failed: ${restartErr?.message ?? restartErr}`,
                );
              }
              const newUrl = currentBaseUrl.replace(/\/$/, "") + t.url;
              response = await gotoWithRetry(page, newUrl);
            } else {
              throw gotoErr;
            }
          } else {
            throw gotoErr;
          }
        }
        if (!response) throw new Error("no response from page.goto");
        if (response.status() >= 400) {
          throw new Error(`HTTP ${response.status()} ${response.statusText()}`);
        }

        // Initial settle so React can commit the post-goto effects.
        await page.waitForTimeout(800);

        // Best-effort networkidle wait so any post-hydration `fetch` calls
        // have a chance to resolve. Capped tight (5s) — many production
        // apps maintain long-poll/websocket connections that would block
        // forever otherwise.
        try {
          await page.waitForLoadState("networkidle", { timeout: 5_000 });
        } catch {
          // ignore — capture what we have
        }

        // Block on image decode so <img src="…cdn…"> tiles don't capture
        // empty boxes. Cap per-image at 3s.
        try {
          await page.evaluate(async () => {
            const imgs = Array.from(document.images);
            await Promise.all(
              imgs.map((img) => {
                if (img.complete && img.naturalWidth > 0) return null;
                return new Promise<void>((resolve) => {
                  const t = setTimeout(resolve, 3_000);
                  img.addEventListener(
                    "load",
                    () => {
                      clearTimeout(t);
                      resolve();
                    },
                    { once: true },
                  );
                  img.addEventListener(
                    "error",
                    () => {
                      clearTimeout(t);
                      resolve();
                    },
                    { once: true },
                  );
                });
              }),
            );
          });
        } catch {
          // ignore — capture what we have
        }

        // Final settle: any state changes triggered by image-load handlers
        // or the post-fetch render need a frame to commit.
        await page.waitForTimeout(300);

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

          // Rewrite root-relative URLs (`/foo.svg`) to absolute URLs against
          // the dev server origin. Captured tiles render inside the viewer's
          // shadow DOM at a different origin, so without this every <img>,
          // <source>, and CSS background-image referenced by relative path
          // 404s. Skip protocol-relative URLs (`//cdn.example.com/x.png`),
          // already-absolute URLs, data: URIs, and bare URI-fragment refs.
          const ORIGIN = location.origin;
          function absolutize(value: string | null | undefined): string {
            if (!value) return value ?? "";
            const v = value.trim();
            if (
              !v ||
              v.startsWith("//") ||
              v.startsWith("data:") ||
              v.startsWith("blob:") ||
              v.startsWith("#") ||
              /^[a-z]+:/i.test(v)
            ) {
              return value!;
            }
            if (v.startsWith("/")) return ORIGIN + v;
            return value!;
          }
          function absolutizeSrcset(value: string): string {
            // srcset is a comma-separated list of `<url> <descriptor>` pairs.
            return value
              .split(",")
              .map((part) => {
                const trimmed = part.trim();
                if (!trimmed) return "";
                const m = trimmed.match(/^(\S+)(\s.*)?$/);
                if (!m) return trimmed;
                return absolutize(m[1]) + (m[2] ?? "");
              })
              .filter(Boolean)
              .join(", ");
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
              if (name === "src" || name === "poster") {
                attrs[a.name] = absolutize(a.value);
                continue;
              }
              if (name === "srcset" || name === "imagesrcset") {
                attrs[a.name] = absolutizeSrcset(a.value);
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

          // Same root-relative → absolute fix for `url(/foo.svg)` references
          // inside captured CSS. background-image / mask-image etc. live
          // here and would 404 in the viewer's shadow DOM otherwise.
          function absolutizeCssUrls(s: string): string {
            return s.replace(
              /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
              (_m, quote, raw) => {
                const trimmed = raw.trim();
                if (
                  !trimmed ||
                  trimmed.startsWith("//") ||
                  trimmed.startsWith("data:") ||
                  trimmed.startsWith("blob:") ||
                  trimmed.startsWith("#") ||
                  /^[a-z]+:/i.test(trimmed)
                ) {
                  return `url(${quote}${raw}${quote})`;
                }
                if (trimmed.startsWith("/")) {
                  return `url(${quote}${ORIGIN + trimmed}${quote})`;
                }
                return `url(${quote}${raw}${quote})`;
              },
            );
          }

          return {
            tree,
            css: absolutizeCssUrls(rewriteViewportUnits(cssChunks.join("\n"))),
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
      if (onTile) {
        try {
          await onTile(captured, out);
        } catch (e: any) {
          log.warn(`onTile callback threw: ${e?.message ?? e}`);
        }
      }
    }
  } finally {
    await ctx.close();
    if (ownsBrowser) await browser.close();
  }

  return { tiles: out, viewport: VIEWPORT };
}
