import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import type {
  SpideyDocument,
  SpideyTile,
  SpideyNode,
  ComponentSpec,
} from "@spidey/shared";
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
  const doc = readDoc(req.docPath);
  const tile = (doc.tiles ?? []).find((t) => t.id === req.tileId);
  if (!tile) throw new RecaptureError(`tile not found: ${req.tileId}`, 404);
  if (tile.kind !== "component" || !tile.component) {
    throw new RecaptureError(
      `tile ${req.tileId} is not a component master tile`,
      400,
    );
  }
  const { projectRoot, framework } = projectInfo(doc);
  const spec = findSpec(doc, tile.component.name, tile.component.file);

  const tiles = await renderComponent({
    projectId: req.projectId,
    projectRoot,
    framework,
    spec,
    propsUsed: req.propsUsed,
    // Reuse the original tile id so the frontend can swap in place.
    // The slug-derived ids would change if the file moved; we don't
    // care — the master tile already has a stable id.
    targetId: req.tileId,
    meta: {
      kind: "component",
      component: {
        name: tile.component.name,
        file: tile.component.file,
        propsUsed: req.propsUsed,
      },
    },
  });
  return { tile: tiles[0] };
}

/**
 * Instance-mode recapture: re-render a single component by name (no
 * master tile required) and return only its rendered subtree, ready to
 * splice into a route tile in place of an instance node.
 *
 * Why a different shape than master recapture:
 * - There's no tile to replace — we just need the component's own DOM.
 * - The viewer keeps the original instance's node id on the new root so
 *   the user's selection remains valid after the swap.
 *
 * The pipeline (write preview → capture → cleanup) is identical to the
 * master path; this just unwraps the inner subtree from the captured
 * tile before returning.
 */
export type InstanceRecaptureRequest = {
  projectId: string;
  docPath: string;
  componentName: string;
  /** Optional file path (relative or absolute) to disambiguate when
   *  multiple components share a name. Match is `endsWith` against the
   *  spec's file, same as the master flow. Omit to take the first match
   *  by name. */
  componentFile?: string;
  propsUsed: Record<string, unknown>;
};

export type InstanceRecaptureResult = {
  /** The freshly rendered component subtree (a single SpideyNode). The
   *  viewer assigns its own id when splicing so existing selection
   *  state stays valid. */
  subtree: SpideyNode;
};

export async function recaptureComponentInstance(
  req: InstanceRecaptureRequest,
): Promise<InstanceRecaptureResult> {
  return withQueue(req.projectId, () => doInstanceRecapture(req));
}

async function doInstanceRecapture(
  req: InstanceRecaptureRequest,
): Promise<InstanceRecaptureResult> {
  const doc = readDoc(req.docPath);
  const { projectRoot, framework } = projectInfo(doc);
  const spec = findSpec(doc, req.componentName, req.componentFile);

  const tiles = await renderComponent({
    projectId: req.projectId,
    projectRoot,
    framework,
    spec,
    propsUsed: req.propsUsed,
    // No master tile to swap into — give the capture an arbitrary id;
    // we discard the tile shell and only keep the inner subtree.
    targetId: `instance:${req.componentName}`,
    meta: {
      kind: "component",
      component: {
        name: req.componentName,
        file: spec.relPath,
        propsUsed: req.propsUsed,
      },
    },
  });
  const tile = tiles[0];
  const subtree = tile.tree
    ? findFirstByComponentName(tile.tree, req.componentName)
    : null;
  if (!subtree) {
    throw new RecaptureError(
      `rendered tree had no <${req.componentName}> subtree — component may have failed to mount`,
      500,
    );
  }
  return { subtree };
}

/** Shared "render one component, return its tile" core used by both
 *  master-mode and instance-mode recapture. */
async function renderComponent(opts: {
  projectId: string;
  projectRoot: string;
  framework: "next" | "vite";
  spec: ComponentSpec;
  propsUsed: Record<string, unknown>;
  targetId: string;
  meta: Partial<SpideyTile>;
}): Promise<SpideyTile[]> {
  const rt = await ensureRuntime(opts.projectId, opts.projectRoot);

  const propsByComponent = new Map<string, Record<string, unknown>>();
  propsByComponent.set(slugKey(opts.spec), opts.propsUsed);

  const { previews, cleanup } = writePreviews(
    opts.projectRoot,
    opts.framework,
    [opts.spec],
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

  try {
    const target: CaptureTarget = {
      id: opts.targetId,
      url: preview.url,
      label: `<${opts.spec.name}>`,
      meta: opts.meta,
    };
    const { tiles } = await captureAll({
      baseUrl: rt.devServer!.url,
      targets: [target],
      browser: rt.browser!,
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
    return tiles;
  } catch (e) {
    if (e instanceof RecaptureError) throw e;
    throw new RecaptureError(
      `recapture failed: ${(e as Error)?.message ?? e}`,
      500,
    );
  } finally {
    // Always remove the temp preview files, even on failure. Leaving
    // them would leak into the user's project tree and conflict on the
    // next request.
    try {
      cleanup();
    } catch {
      // best-effort
    }
  }
}

function readDoc(docPath: string): SpideyDocument {
  try {
    return JSON.parse(fs.readFileSync(docPath, "utf8")) as SpideyDocument;
  } catch (e) {
    throw new RecaptureError(
      `failed to read spidey.json: ${(e as Error)?.message ?? e}`,
      500,
    );
  }
}

function projectInfo(doc: SpideyDocument): {
  projectRoot: string;
  framework: "next" | "vite";
} {
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
  return { projectRoot, framework };
}

function findSpec(
  doc: SpideyDocument,
  name: string,
  file?: string,
): ComponentSpec {
  const catalog = doc.components ?? [];
  const spec = file
    ? catalog.find((c) => c.name === name && c.file.endsWith(file))
    : catalog.find((c) => c.name === name);
  if (!spec) {
    throw new RecaptureError(
      `component spec not found in doc catalog: ${name}${file ? ` (${file})` : ""}`,
      404,
    );
  }
  return spec;
}

async function ensureRuntime(
  projectId: string,
  projectRoot: string,
): Promise<ProjectRuntime> {
  const rt = getRuntime(projectId);
  if (!rt.devServer) {
    log.step(`[recapture] starting dev server for ${projectId}`);
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
  return rt;
}

/** Walk a captured tree and return the first element whose
 *  data-spidey-component attribute matches `name`. The component's
 *  preview wrapper sits between body and the actual rendered component
 *  (Router/MemoryRouter on Vite, root layout on Next), so we descend
 *  past it. */
function findFirstByComponentName(
  node: SpideyNode,
  name: string,
): SpideyNode | null {
  if (node.kind === "el") {
    if (node.attrs["data-spidey-component"] === name) return node;
    for (const c of node.children) {
      const found = findFirstByComponentName(c, name);
      if (found) return found;
    }
  }
  return null;
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

