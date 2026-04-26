import fs from "node:fs";
import path from "node:path";
import type { SpideyDocument, SpideyPage } from "@spidey/shared";
import { detectProject } from "../detect.js";
import { discoverNextRoutes } from "../routes/next.js";
import { discoverViteRoutes } from "../routes/vite.js";
import { startDevServer, type RunningDevServer } from "../devServer.js";
import { captureAll, type CaptureTarget } from "../capture.js";
import {
  describeComponents,
  discoverComponents,
} from "../components/discover.js";
import { generateProps } from "../components/faker.js";
import { writePreviews, slugKey } from "../components/preview.js";
import { log } from "../util.js";

export type GenerateOptions = {
  projectPath: string;
  outputPath: string;
  components: boolean;
};

export async function runGenerate(opts: GenerateOptions): Promise<void> {
  const project = detectProject(opts.projectPath);
  log.info(`${project.name} (${project.framework}) at ${project.root}`);

  // ----- Routes -----
  log.step("discovering routes");
  const routes =
    project.framework === "next"
      ? discoverNextRoutes(project.root)
      : discoverViteRoutes(project.root);
  if (routes.length === 0) {
    throw new Error(
      `No routes discovered. ${
        project.framework === "next"
          ? "Make sure your app/ directory contains page.tsx files."
          : "Make sure your app uses <Route path=...> or createBrowserRouter([...])."
      }`,
    );
  }
  log.ok(`found ${routes.length} route${routes.length === 1 ? "" : "s"}`);
  for (const r of routes)
    log.dim(r.pattern + (r.pattern !== r.url ? `  →  ${r.url}` : ""));

  // ----- Components -----
  let componentSpecs: ReturnType<typeof discoverComponents> = [];
  let cleanupPreviews: (() => void) | null = null;
  let previewTargets: CaptureTarget[] = [];

  if (opts.components) {
    log.step("discovering components");
    try {
      componentSpecs = discoverComponents(project.root);
    } catch (e: any) {
      log.warn(`component discovery failed: ${e?.message ?? e}`);
      componentSpecs = [];
    }

    if (componentSpecs.length > 0) {
      log.ok(
        `found ${componentSpecs.length} component${componentSpecs.length === 1 ? "" : "s"}`,
      );
      describeComponents(componentSpecs);

      const propsByComponent = new Map<string, Record<string, unknown>>();
      for (const c of componentSpecs) {
        propsByComponent.set(slugKey(c), generateProps(c));
      }

      const { previews, cleanup } = writePreviews(
        project.root,
        project.framework,
        componentSpecs,
        propsByComponent,
      );
      cleanupPreviews = cleanup;
      previewTargets = previews.map((p) => ({
        id: `component:${p.slug}`,
        url: p.url,
        label: `<${p.component.name}>`,
        meta: {
          kind: "component",
          component: {
            name: p.component.name,
            file: p.component.relPath,
            propsUsed: p.propsUsed,
          },
        },
      }));
    } else {
      log.dim("no components found");
    }
  }

  let dev: RunningDevServer | null = null;
  let exitHandler: (() => void) | null = null;
  try {
    dev = await startDevServer(project.root);

    const devRef = dev;
    const cleanupRef = cleanupPreviews;
    exitHandler = () => {
      log.warn("interrupted; stopping dev server");
      try {
        cleanupRef?.();
      } catch {}
      devRef.stop().finally(() => process.exit(130));
    };
    process.on("SIGINT", exitHandler);
    process.on("SIGTERM", exitHandler);

    const routeTargets: CaptureTarget[] = routes.map((r) => ({
      id: `route:${makeRouteId(r.pattern)}`,
      url: r.url,
      label: r.pattern,
      meta: {
        kind: "route",
        route: r.pattern,
        url: r.url,
      },
    }));

    const { pages, viewport } = await captureAll({
      baseUrl: dev.url,
      targets: [...routeTargets, ...previewTargets],
    });

    const doc: SpideyDocument = {
      version: opts.components && componentSpecs.length > 0 ? 2 : 1,
      generatedAt: new Date().toISOString(),
      project: {
        name: project.name,
        framework: project.framework,
        root: project.root,
      },
      capture: {
        viewport,
        devServerUrl: dev.url,
      },
      pages,
      components: componentSpecs.length > 0 ? componentSpecs : undefined,
    };

    const outPath = path.resolve(opts.outputPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));

    const summarize = (kind: SpideyPage["kind"]) => {
      const subset = pages.filter((p) => (p.kind ?? "route") === kind);
      const ok = subset.filter((p) => p.status === "ok").length;
      const err = subset.length - ok;
      return `${subset.length} ${kind}${subset.length === 1 ? "" : "s"} (${ok} ok${err ? `, ${err} errors` : ""})`;
    };
    log.ok(
      `wrote ${outPath} — ${summarize("route")}` +
        (componentSpecs.length > 0 ? `, ${summarize("component")}` : ""),
    );
    log.dim(`run \`spidey view ${path.relative(process.cwd(), outPath)}\` to open`);
  } finally {
    if (exitHandler) {
      process.off("SIGINT", exitHandler);
      process.off("SIGTERM", exitHandler);
    }
    if (cleanupPreviews) {
      if (process.env.SPIDEY_KEEP_PREVIEWS) {
        log.warn("SPIDEY_KEEP_PREVIEWS set — leaving preview files in place");
      } else {
        log.step("cleaning up preview files");
        try {
          cleanupPreviews();
        } catch (e: any) {
          log.warn(`cleanup failed: ${e?.message ?? e}`);
        }
      }
    }
    if (dev) {
      log.step("stopping dev server");
      await dev.stop();
    }
  }
}

function makeRouteId(pattern: string): string {
  const s = pattern
    .replace(/^\/+/, "")
    .replace(/\W+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "root";
}
