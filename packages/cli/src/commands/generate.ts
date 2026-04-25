import fs from "node:fs";
import path from "node:path";
import type { SpideyDocument } from "@spidey/shared";
import { detectProject } from "../detect.js";
import { discoverNextRoutes } from "../routes/next.js";
import { discoverViteRoutes } from "../routes/vite.js";
import { startDevServer, type RunningDevServer } from "../devServer.js";
import { captureAll } from "../capture.js";
import { log } from "../util.js";

export type GenerateOptions = {
  projectPath: string;
  outputPath: string;
};

export async function runGenerate(opts: GenerateOptions): Promise<void> {
  const project = detectProject(opts.projectPath);
  log.info(
    `${project.name} (${project.framework}) at ${project.root}`,
  );

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
  for (const r of routes) log.dim(r.pattern + (r.pattern !== r.url ? `  →  ${r.url}` : ""));

  let dev: RunningDevServer | null = null;
  let exitHandler: (() => void) | null = null;
  try {
    dev = await startDevServer(project.root);

    // Make sure we tear down even on Ctrl+C
    const devRef = dev;
    exitHandler = () => {
      log.warn("interrupted; stopping dev server");
      devRef.stop().finally(() => process.exit(130));
    };
    process.on("SIGINT", exitHandler);
    process.on("SIGTERM", exitHandler);

    const { pages, viewport } = await captureAll({
      baseUrl: dev.url,
      routes,
    });

    const doc: SpideyDocument = {
      version: 1,
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
    };

    const outPath = path.resolve(opts.outputPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
    const okCount = pages.filter((p) => p.status === "ok").length;
    const errCount = pages.length - okCount;
    log.ok(
      `wrote ${outPath} (${okCount} ok${errCount ? `, ${errCount} errors` : ""})`,
    );
    log.dim(`run \`spidey view ${path.relative(process.cwd(), outPath)}\` to open`);
  } finally {
    if (exitHandler) {
      process.off("SIGINT", exitHandler);
      process.off("SIGTERM", exitHandler);
    }
    if (dev) {
      log.step("stopping dev server");
      await dev.stop();
    }
  }
}
