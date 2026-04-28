import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import type { SpideyDocument, SpideyTile } from "@spidey/shared";
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
  /** Cap how many components get captured. Workspace packages
   *  sort first (curated UI libs are higher signal than page-coupled
   *  project-local components), alphabetical within each group. */
  maxComponents?: number;
  /** Skip the prompt that warns when overwriting a doc with viewer edits. */
  force?: boolean;
};

export async function runGenerate(opts: GenerateOptions): Promise<void> {
  const project = detectProject(opts.projectPath);
  log.info(`${project.name} (${project.framework}) at ${project.root}`);

  // ----- Clobber check -----
  // If an existing v3 doc has been edited in the viewer, prompt before
  // overwriting. --force skips the prompt for scripted/CI use.
  const outPathAbs = path.resolve(opts.outputPath);
  if (!opts.force && fs.existsSync(outPathAbs)) {
    try {
      const raw = fs.readFileSync(outPathAbs, "utf8");
      const existing = JSON.parse(raw) as SpideyDocument;
      if (existing.version === 3 && existing.editedAt) {
        const ok = await promptYesNo(
          `Existing ${path.basename(outPathAbs)} has unsaved viewer edits from ${existing.editedAt}. Overwrite? [y/N] `,
        );
        if (!ok) {
          log.warn("aborted (use --force to skip this prompt)");
          return;
        }
      }
    } catch {
      // not JSON or unreadable — fall through and overwrite
    }
  }

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

      if (
        opts.maxComponents !== undefined &&
        opts.maxComponents > 0 &&
        componentSpecs.length > opts.maxComponents
      ) {
        // Tiered priority: design-system packages (`ui`, `ui-patterns`,
        // `marketing`, `icons`) → other workspace packages (`common`,
        // `dev-tools`) → project-local. Within a tier, sort by name.
        // Utility packages tend to expose providers / hooks-as-components
        // that don't render anything visual on their own, so preferring
        // visual packages gives a better signal when smoke-testing.
        const VISUAL_PKGS = ["ui", "ui-patterns", "marketing", "icons"];
        const score = (c: typeof componentSpecs[number]) => {
          const m = c.relPath.match(/^@workspace\/([^/]+)/);
          if (m && VISUAL_PKGS.includes(m[1])) return 0;
          if (m) return 1; // workspace but not a designated visual package
          return 2; // project-local
        };
        componentSpecs = [...componentSpecs]
          .sort((a, b) => {
            const sa = score(a);
            const sb = score(b);
            if (sa !== sb) return sa - sb;
            return a.name.localeCompare(b.name);
          })
          .slice(0, opts.maxComponents);
        log.dim(
          `capped at --max-components=${opts.maxComponents} (visual workspace packages first)`,
        );
      }

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

    const cleanupRef = cleanupPreviews;
    // Reads the live `dev` binding so a restart (onDevServerDeath) is
    // covered: SIGINT after a restart still kills the new process, not
    // the dead one captured at the time the handler was registered.
    exitHandler = () => {
      log.warn("interrupted; stopping dev server");
      try {
        cleanupRef?.();
      } catch {}
      const current = dev;
      if (current) current.stop().finally(() => process.exit(130));
      else process.exit(130);
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

    // Mid-run persistence: write spidey.json after each tile so a partial
    // run is visible in the viewer and survives Ctrl-C / crashes. Only the
    // primary doc is updated; the baseline sidecar is written once at the
    // end of a successful run so it reflects a full capture only.
    fs.mkdirSync(path.dirname(outPathAbs), { recursive: true });
    const writePartial = (tilesSoFar: SpideyTile[]) => {
      const doc: SpideyDocument = {
        version: 3,
        generatedAt: new Date().toISOString(),
        project: {
          name: project.name,
          framework: project.framework,
          root: project.root,
        },
        capture: {
          viewport: { width: 1280, height: 800 },
          devServerUrl: dev!.url,
        },
        tiles: tilesSoFar,
        components: componentSpecs.length > 0 ? componentSpecs : undefined,
      };
      fs.writeFileSync(outPathAbs, JSON.stringify(doc, null, 2));
    };

    const { tiles, viewport } = await captureAll({
      baseUrl: dev.url,
      targets: [...routeTargets, ...previewTargets],
      onTile: (_tile, allSoFar) => writePartial(allSoFar),
      onDevServerDeath: async () => {
        // Heavy monorepo dev servers (Next.js compiling 549 component
        // previews + 87 routes) sometimes OOM and die mid-run. Tear down
        // the corpse, start a fresh one, and let capture continue from
        // wherever it was. The .next/cache on disk persists so the
        // restarted server hot-loads compiled routes faster than the
        // first run.
        try {
          await dev?.stop();
        } catch {
          // already gone
        }
        const fresh = await startDevServer(project.root);
        dev = fresh;
        return fresh.url;
      },
    });

    const doc: SpideyDocument = {
      version: 3,
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
      tiles,
      components: componentSpecs.length > 0 ? componentSpecs : undefined,
    };

    fs.mkdirSync(path.dirname(outPathAbs), { recursive: true });
    const docJson = JSON.stringify(doc, null, 2);
    fs.writeFileSync(outPathAbs, docJson);

    // Baseline sidecar: a frozen copy of the doc as captured. The viewer
    // diffs the editable trees against this to compute the changeset for
    // the coding-agent handoff. Lives next to spidey.json so it travels
    // with the project.
    const baselineDir = path.join(path.dirname(outPathAbs), ".spidey");
    const baselinePath = path.join(baselineDir, "baseline.json");
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.writeFileSync(baselinePath, docJson);

    const summarize = (kind: SpideyTile["kind"]) => {
      const subset = tiles.filter((p) => (p.kind ?? "route") === kind);
      const ok = subset.filter((p) => p.status === "ok").length;
      const err = subset.length - ok;
      return `${subset.length} ${kind}${subset.length === 1 ? "" : "s"} (${ok} ok${err ? `, ${err} errors` : ""})`;
    };
    log.ok(
      `wrote ${outPathAbs} — ${summarize("route")}` +
        (componentSpecs.length > 0 ? `, ${summarize("component")}` : ""),
    );
    log.dim(
      `run \`spidey view ${path.relative(process.cwd(), outPathAbs)}\` to open`,
    );
    log.dim("tip: add `.spidey/` to .gitignore");
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

async function promptYesNo(question: string): Promise<boolean> {
  // No TTY (piped/CI) → default to "no" so we never silently clobber edits.
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
