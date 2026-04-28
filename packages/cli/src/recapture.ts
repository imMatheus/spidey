import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import type { SpideyDocument, SpideyTile, ComponentSpec } from "@spidey/shared";
import { startDevServer, type RunningDevServer } from "./devServer.js";
import { captureAll, type CaptureTarget } from "./capture.js";
import { writePreviews, slugKey } from "./components/preview.js";
import { log } from "./util.js";

/**
 * Per-project runtime state for on-demand component re-capture.
 *
 * Both the dev server and the Playwright browser are expensive to start
 * (5–15s combined cold), so the view server caches one of each per
 * project. The first /recapture for a project pays the cost; subsequent
 * ones reuse.
 *
 * Lifecycle:
 *   - Lazy-init on first request
 *   - Reused across requests
 *   - Torn down via `disposeAll()` when the view server shuts down
 *
 * We deliberately don't add idle timeouts. The view server is a
 * developer tool used on localhost; the cost of holding a few hundred
 * MB of Chromium is fine in exchange for fast iteration.
 */
type ProjectRuntime = {
  devServer: RunningDevServer | null;
  browser: Browser | null;
};

const runtimes = new Map<string, ProjectRuntime>();

function getRuntime(projectId: string): ProjectRuntime {
  let rt = runtimes.get(projectId);
  if (!rt) {
    rt = { devServer: null, browser: null };
    runtimes.set(projectId, rt);
  }
  return rt;
}

/** Concurrency guard: serialize recaptures per project so two simultaneous
 *  edits don't fight over the same preview file pair. The browser+devServer
 *  could in theory handle multiple pages, but the preview-file write/cleanup
 *  is shared state. */
const projectQueues = new Map<string, Promise<unknown>>();

async function withQueue<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = projectQueues.get(projectId) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run regardless of prev's outcome
  projectQueues.set(
    projectId,
    next.catch(() => {
      /* swallow so the chain continues */
    }),
  );
  return next;
}

export type RecaptureRequest = {
  projectId: string;
  /** Absolute path to the project's spidey.json (read fresh — may have
   *  been updated by autosave between calls). */
  docPath: string;
  /** Tile id of the master component tile to re-render. Must be a
   *  `kind: "component"` tile. */
  tileId: string;
  /** New propsUsed to re-render with. The capture-time `propsUsed` on
   *  the master tile is replaced with this exact value on success. */
  propsUsed: Record<string, unknown>;
};

export type RecaptureResult = {
  /** The freshly captured tile, ready to slot back into doc.tiles. */
  tile: SpideyTile;
};

export class RecaptureError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "RecaptureError";
  }
}

export async function recaptureMasterTile(
  req: RecaptureRequest,
): Promise<RecaptureResult> {
  return withQueue(req.projectId, () => doRecapture(req));
}

async function doRecapture(req: RecaptureRequest): Promise<RecaptureResult> {
  // ----- Read the doc fresh. autosave may have rewritten it since
  // startup. We use it only for project metadata + finding the
  // component spec; we do NOT mutate it here (the viewer's autosave
  // owns the doc).
  let doc: SpideyDocument;
  try {
    doc = JSON.parse(fs.readFileSync(req.docPath, "utf8")) as SpideyDocument;
  } catch (e) {
    throw new RecaptureError(
      `failed to read spidey.json: ${(e as Error)?.message ?? e}`,
      500,
    );
  }

  const tile = (doc.tiles ?? []).find((t) => t.id === req.tileId);
  if (!tile) throw new RecaptureError(`tile not found: ${req.tileId}`, 404);
  if (tile.kind !== "component" || !tile.component) {
    throw new RecaptureError(
      `tile ${req.tileId} is not a component master tile`,
      400,
    );
  }
  const projectRoot = doc.project?.root;
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    throw new RecaptureError(
      `project root not accessible: ${projectRoot ?? "(unset)"}`,
      400,
    );
  }
  const framework = doc.project?.framework;
  if (framework !== "next" && framework !== "vite") {
    throw new RecaptureError(
      `unsupported framework: ${framework ?? "(unknown)"}`,
      400,
    );
  }

  // ----- Find the matching ComponentSpec from the doc catalog. The
  // preview pipeline needs the full spec (file/exportKind/props), and
  // the catalog is the only place those live after `spidey generate`.
  const componentName = tile.component.name;
  const componentFile = tile.component.file;
  const spec = (doc.components ?? []).find(
    (c) => c.name === componentName && c.file.endsWith(componentFile),
  );
  if (!spec) {
    throw new RecaptureError(
      `component spec not found in doc catalog: ${componentName} (${componentFile})`,
      404,
    );
  }

  // ----- Lazy-start dev server + browser for this project.
  const rt = getRuntime(req.projectId);
  if (!rt.devServer) {
    log.step(`[recapture] starting dev server for ${req.projectId}`);
    try {
      rt.devServer = await startDevServer(projectRoot);
    } catch (e) {
      throw new RecaptureError(
        `failed to start dev server: ${(e as Error)?.message ?? e}`,
        500,
      );
    }
  }
  if (!rt.browser) {
    try {
      rt.browser = await chromium.launch({ headless: true });
    } catch (e) {
      throw new RecaptureError(
        `failed to launch browser (try \`bunx playwright install chromium\`): ${(e as Error)?.message ?? e}`,
        500,
      );
    }
  }

  // ----- Write a single-component preview, capture, clean up. We reuse
  // the `writePreviews` helper rather than duplicating its
  // framework-specific entry-file logic.
  const propsByComponent = new Map<string, Record<string, unknown>>();
  propsByComponent.set(slugKey(spec), req.propsUsed);

  const { previews, cleanup } = writePreviews(
    projectRoot,
    framework,
    [spec],
    propsByComponent,
  );
  if (previews.length !== 1) {
    cleanup();
    throw new RecaptureError(
      `expected 1 preview, got ${previews.length}`,
      500,
    );
  }
  const preview = previews[0];

  let result: RecaptureResult;
  try {
    const target: CaptureTarget = {
      // Reuse the original tile id so the frontend can swap in place.
      // The slug-derived ids would change if the file moved; we don't
      // care — the master tile already has a stable id.
      id: req.tileId,
      url: preview.url,
      label: `<${componentName}>`,
      meta: {
        kind: "component",
        component: {
          name: componentName,
          file: componentFile,
          propsUsed: req.propsUsed,
        },
      },
    };
    const { tiles } = await captureAll({
      baseUrl: rt.devServer.url,
      targets: [target],
      browser: rt.browser,
    });
    if (tiles.length !== 1) {
      throw new RecaptureError(
        `capture returned ${tiles.length} tiles, expected 1`,
        500,
      );
    }
    if (tiles[0].status === "error") {
      throw new RecaptureError(
        `capture failed: ${tiles[0].error ?? "unknown"}`,
        500,
      );
    }
    result = { tile: tiles[0] };
  } catch (e) {
    if (e instanceof RecaptureError) throw e;
    throw new RecaptureError(
      `recapture failed: ${(e as Error)?.message ?? e}`,
      500,
    );
  } finally {
    // Always remove the temp preview files, even on failure. The
    // alternative (leaving them) leaks files into the user's project
    // tree and would conflict on the next request.
    try {
      cleanup();
    } catch {
      // best-effort
    }
  }

  return result;
}

/** Tear down all per-project runtimes. Called from the view server's
 *  shutdown handler. */
export async function disposeAll(): Promise<void> {
  const all = Array.from(runtimes.values());
  runtimes.clear();
  await Promise.allSettled(
    all.map(async (rt) => {
      if (rt.browser) {
        try {
          await rt.browser.close();
        } catch {
          /* ignore */
        }
      }
      if (rt.devServer) {
        try {
          await rt.devServer.stop();
        } catch {
          /* ignore */
        }
      }
    }),
  );
}

