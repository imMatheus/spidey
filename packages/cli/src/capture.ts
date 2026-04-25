import { chromium, type Browser } from "playwright";
import type { SpideyPage } from "@spidey/shared";
import type { DiscoveredRoute } from "./routes/next.js";
import { log } from "./util.js";

const VIEWPORT = { width: 1280, height: 800 };

export type CaptureOptions = {
  baseUrl: string;
  routes: DiscoveredRoute[];
};

export async function captureAll({
  baseUrl,
  routes,
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
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      const url = baseUrl.replace(/\/$/, "") + r.url;
      log.step(`capturing [${i + 1}/${routes.length}] ${r.pattern} → ${url}`);

      const page = await ctx.newPage();
      const captured: SpideyPage = {
        id: makeId(r.pattern),
        route: r.pattern,
        url: r.url,
        status: "ok",
        html: "",
        css: "",
        capturedAt: new Date().toISOString(),
        viewport: VIEWPORT,
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

        // settle
        await page.waitForTimeout(500);

        captured.title = await page.title();

        const { html, css } = await page.evaluate(async () => {
          const cssChunks: string[] = [];
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              const rules = sheet.cssRules;
              if (!rules) continue;
              for (let i = 0; i < rules.length; i++) {
                cssChunks.push(rules[i].cssText);
              }
            } catch {
              // cross-origin: try fetching
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
          return {
            html: document.body?.innerHTML ?? "",
            css: cssChunks.join("\n"),
          };
        });

        captured.html = html;
        captured.css = css;
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

function makeId(pattern: string): string {
  const s = pattern
    .replace(/^\/+/, "")
    .replace(/\W+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "root";
}
