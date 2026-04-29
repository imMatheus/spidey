import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { dirExists, fileExists, log } from "./util.js";
import {
  getJob,
  getProjectActiveJob,
  startJob,
  HandoffError,
  type AgentName,
} from "./handoff.js";
import {
  RecaptureError,
  disposeAll as disposeRecaptureRuntimes,
  recaptureMasterTile,
  recaptureComponentInstance,
} from "./recapture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function findViewerDist(): string | null {
  const candidates = [
    path.resolve(__dirname, "../../viewer/dist"),
    path.resolve(__dirname, "../viewer/dist"),
  ];
  for (const c of candidates) if (dirExists(c)) return c;
  return null;
}

type Project = { id: string; name: string; absPath: string };

function deriveProjects(jsonPaths: string[]): Project[] {
  const used = new Set<string>();
  return jsonPaths.map((p, idx) => {
    const abs = path.resolve(p);
    if (!fileExists(abs)) {
      throw new Error(`spidey.json not found: ${abs}`);
    }
    // Use the parent directory name when the file is the canonical
    // "spidey.json", otherwise fall back to the filename. Disambiguate on
    // collision by appending a counter.
    const base = path.basename(abs);
    const parent = path.basename(path.dirname(abs));
    let name =
      base === "spidey.json" ? parent : base.replace(/\.spidey\.json$/, "").replace(/\.json$/, "");
    if (!name) name = `project-${idx + 1}`;
    let id = name;
    let n = 2;
    while (used.has(id)) id = `${name}-${n++}`;
    used.add(id);
    return { id, name: id, absPath: abs };
  });
}

export async function startViewer({
  jsonPaths,
  port,
  open,
}: {
  jsonPaths: string[];
  port: number;
  open: boolean;
}): Promise<void> {
  if (jsonPaths.length === 0) {
    throw new Error("spidey view: at least one spidey.json path is required");
  }
  const projects = deriveProjects(jsonPaths);

  const dist = findViewerDist();
  if (!dist) {
    throw new Error(
      "Viewer bundle not found. Run `bun run build` from the spidey monorepo root first.",
    );
  }
  const indexHtml = path.join(dist, "index.html");
  if (!fileExists(indexHtml)) {
    throw new Error(`Viewer dist exists at ${dist} but index.html is missing.`);
  }

  const projectsManifest = projects.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);

    // Manifest of all projects available in this session.
    if (pathname === "/spidey-projects.json") {
      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(projectsManifest));
      return;
    }

    // Baseline sidecar: GET /spidey-projects/:id/baseline.json — streams the
    // .spidey/baseline.json that `spidey generate` writes alongside the main
    // doc. The viewer diffs the editable trees against this baseline to
    // compute the agent-handoff changeset.
    const baselineMatch = pathname.match(
      /^\/spidey-projects\/([^/]+)\/baseline\.json$/,
    );
    if (baselineMatch) {
      const id = baselineMatch[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      const baselinePath = path.join(
        path.dirname(project.absPath),
        ".spidey",
        "baseline.json",
      );
      if (!fileExists(baselinePath)) {
        res.statusCode = 404;
        res.end("no baseline — re-run `spidey generate`");
        return;
      }
      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      fs.createReadStream(baselinePath)
        .on("error", (e) => {
          res.statusCode = 500;
          res.end(String(e));
        })
        .pipe(res);
      return;
    }

    // Handoff: POST /spidey-projects/:id/handoff — spawn a coding agent in
    // the project root with the rendered prompt. Returns { jobId }.
    const handoffStart = pathname.match(
      /^\/spidey-projects\/([^/]+)\/handoff$/,
    );
    if (handoffStart && req.method === "POST") {
      const id = handoffStart[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      const MAX = 5 * 1024 * 1024; // prompts can be large but not insane
      req.on("data", (c) => {
        total += c.length;
        if (total > MAX) {
          res.statusCode = 413;
          res.end("body too large");
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const parsed = JSON.parse(body) as {
            agent?: string;
            prompt?: string;
          };
          const agent = parsed.agent;
          const prompt = parsed.prompt;
          if (agent !== "claude" && agent !== "codex") {
            res.statusCode = 400;
            res.end("agent must be 'claude' or 'codex'");
            return;
          }
          if (typeof prompt !== "string" || !prompt.trim()) {
            res.statusCode = 400;
            res.end("prompt is required");
            return;
          }
          // Resolve the project's source root from the doc — this is where
          // the agent's edits should land. Fall back to the directory
          // holding spidey.json if the doc can't be read.
          let cwd = path.dirname(project.absPath);
          try {
            const doc = JSON.parse(fs.readFileSync(project.absPath, "utf8"));
            if (doc?.project?.root && typeof doc.project.root === "string") {
              cwd = doc.project.root;
            }
          } catch {
            // best-effort
          }
          const job = startJob({
            projectId: project.id,
            agent: agent as AgentName,
            prompt,
            cwd,
            logDir: path.dirname(project.absPath),
          });
          res.setHeader("content-type", MIME[".json"]);
          res.statusCode = 200;
          res.end(JSON.stringify({ jobId: job.id }));
        } catch (e) {
          if (e instanceof HandoffError) {
            res.statusCode = e.statusCode;
            res.end(e.message);
          } else {
            res.statusCode = 400;
            res.end(`bad request: ${(e as Error)?.message ?? e}`);
          }
        }
      });
      return;
    }

    // Handoff status: GET /spidey-projects/:id/handoff/:jobId
    const handoffStatus = pathname.match(
      /^\/spidey-projects\/([^/]+)\/handoff\/([^/]+)$/,
    );
    if (handoffStatus && req.method === "GET") {
      const id = handoffStatus[1];
      const jobId = handoffStatus[2];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      const job = getJob(jobId);
      if (!job || job.projectId !== project.id) {
        res.statusCode = 404;
        res.end("job not found");
        return;
      }
      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(job));
      return;
    }

    // Active-job lookup: GET /spidey-projects/:id/handoff (no jobId) — lets
    // the viewer reattach to a running job after a refresh.
    if (handoffStart && req.method === "GET") {
      const id = handoffStart[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      const active = getProjectActiveJob(project.id);
      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ active }));
      return;
    }

    // Recapture: POST /spidey-projects/:id/recapture — re-render a
    // component master tile with new propsUsed and return the freshly
    // captured tile. The viewer's autosave still owns persisting the
    // doc; we just hand back the tile for the editor to swap in.
    const recaptureMatch = pathname.match(
      /^\/spidey-projects\/([^/]+)\/recapture$/,
    );
    if (recaptureMatch && req.method === "POST") {
      const id = recaptureMatch[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      const MAX = 5 * 1024 * 1024;
      req.on("data", (c) => {
        total += c.length;
        if (total > MAX) {
          res.statusCode = 413;
          res.end("body too large");
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", async () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const parsed = JSON.parse(body) as {
            tileId?: string;
            propsUsed?: Record<string, unknown>;
          };
          if (typeof parsed.tileId !== "string" || !parsed.tileId) {
            res.statusCode = 400;
            res.end("tileId is required");
            return;
          }
          if (
            !parsed.propsUsed ||
            typeof parsed.propsUsed !== "object" ||
            Array.isArray(parsed.propsUsed)
          ) {
            res.statusCode = 400;
            res.end("propsUsed must be a plain object");
            return;
          }
          const result = await recaptureMasterTile({
            projectId: project.id,
            docPath: project.absPath,
            tileId: parsed.tileId,
            propsUsed: parsed.propsUsed,
          });
          res.setHeader("content-type", MIME[".json"]);
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (e) {
          if (e instanceof RecaptureError) {
            res.statusCode = e.statusCode;
            res.end(e.message);
          } else {
            res.statusCode = 500;
            res.end(`recapture failed: ${(e as Error)?.message ?? e}`);
          }
        }
      });
      req.on("error", (e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
      return;
    }

    // Recapture an instance: POST /spidey-projects/:id/recapture-instance
    // — re-render a component by name with the given props and return only
    // its rendered subtree, ready to splice into a route tile in place of
    // an instance node. The viewer drives this from the Inspector when the
    // user edits an instance's props on a route tile.
    const recaptureInstanceMatch = pathname.match(
      /^\/spidey-projects\/([^/]+)\/recapture-instance$/,
    );
    if (recaptureInstanceMatch && req.method === "POST") {
      const id = recaptureInstanceMatch[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      const MAX = 5 * 1024 * 1024;
      req.on("data", (c) => {
        total += c.length;
        if (total > MAX) {
          res.statusCode = 413;
          res.end("body too large");
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", async () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const parsed = JSON.parse(body) as {
            componentName?: string;
            componentFile?: string;
            propsUsed?: Record<string, unknown>;
          };
          if (
            typeof parsed.componentName !== "string" ||
            !parsed.componentName
          ) {
            res.statusCode = 400;
            res.end("componentName is required");
            return;
          }
          if (
            !parsed.propsUsed ||
            typeof parsed.propsUsed !== "object" ||
            Array.isArray(parsed.propsUsed)
          ) {
            res.statusCode = 400;
            res.end("propsUsed must be a plain object");
            return;
          }
          const result = await recaptureComponentInstance({
            projectId: project.id,
            docPath: project.absPath,
            componentName: parsed.componentName,
            componentFile:
              typeof parsed.componentFile === "string"
                ? parsed.componentFile
                : undefined,
            propsUsed: parsed.propsUsed,
          });
          res.setHeader("content-type", MIME[".json"]);
          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (e) {
          if (e instanceof RecaptureError) {
            res.statusCode = e.statusCode;
            res.end(e.message);
          } else {
            res.statusCode = 500;
            res.end(
              `recapture-instance failed: ${(e as Error)?.message ?? e}`,
            );
          }
        }
      });
      req.on("error", (e) => {
        res.statusCode = 500;
        res.end(String(e));
      });
      return;
    }

    // Per-project JSON, e.g. /spidey-projects/next-app.json
    const m = pathname.match(/^\/spidey-projects\/([^/]+)\.json$/);
    if (m) {
      const id = m[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }

      // PUT: viewer is autosaving an edited document. We accept the full
      // doc, validate it parses + is v3, and overwrite the project's file.
      // Localhost-only by design; no auth.
      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        let total = 0;
        const MAX = 50 * 1024 * 1024; // 50 MB hard cap
        req.on("data", (c) => {
          total += c.length;
          if (total > MAX) {
            res.statusCode = 413;
            res.end("body too large");
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            const parsed = JSON.parse(body);
            if (
              !parsed ||
              typeof parsed !== "object" ||
              parsed.version !== 3 ||
              !Array.isArray(parsed.tiles)
            ) {
              res.statusCode = 400;
              res.end("expected a v3 SpideyDocument with tiles[]");
              return;
            }
            // Pretty-print to keep the on-disk file diffable.
            fs.writeFileSync(project.absPath, JSON.stringify(parsed, null, 2));
            res.statusCode = 204;
            res.end();
          } catch (e: any) {
            res.statusCode = 400;
            res.end(`bad request: ${e?.message ?? e}`);
          }
        });
        req.on("error", (e) => {
          res.statusCode = 500;
          res.end(String(e));
        });
        return;
      }

      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      fs.createReadStream(project.absPath)
        .on("error", (e) => {
          res.statusCode = 500;
          res.end(String(e));
        })
        .pipe(res);
      return;
    }

    // Static asset proxy: GET /_spidey-static/:projectId/<path>. Serves
    // files from the project's `public/` directory so tiles render with
    // their images even after the user's dev server has stopped. Path
    // traversal is rejected by `path.relative` going outside the public
    // root. We don't proxy `/_next/image` resizes (those need a live
    // dev server) — `_next/image?url=X` URLs in tiles are unwrapped to
    // the underlying static path on the viewer side before they hit us.
    const staticMatch = pathname.match(
      /^\/_spidey-static\/([^/]+)\/(.+)$/,
    );
    if (staticMatch) {
      const id = staticMatch[1];
      const project = projects.find((p) => p.id === id);
      if (!project) {
        res.statusCode = 404;
        res.end("project not found");
        return;
      }
      let projectRoot: string | null = null;
      try {
        const doc = JSON.parse(fs.readFileSync(project.absPath, "utf8"));
        if (doc?.project?.root && typeof doc.project.root === "string") {
          projectRoot = doc.project.root;
        }
      } catch {
        // fall through to 404
      }
      if (!projectRoot) {
        res.statusCode = 404;
        res.end("project root unknown");
        return;
      }
      const publicDir = path.join(projectRoot, "public");
      const requested = path.join(publicDir, staticMatch[2]);
      const rel = path.relative(publicDir, requested);
      if (rel.startsWith("..") || path.isAbsolute(rel)) {
        res.statusCode = 403;
        res.end("forbidden");
        return;
      }
      if (!fileExists(requested)) {
        res.statusCode = 404;
        res.end("asset not found");
        return;
      }
      const ext = path.extname(requested).toLowerCase();
      res.setHeader(
        "content-type",
        MIME[ext] ?? "application/octet-stream",
      );
      // Cache for the session. Dev assets shouldn't change while the
      // viewer is open, and a max-age makes the second-hit zero-cost.
      res.setHeader("cache-control", "max-age=300");
      fs.createReadStream(requested)
        .on("error", (e) => {
          res.statusCode = 500;
          res.end(String(e));
        })
        .pipe(res);
      return;
    }

    // Backwards-compat: serve the first project at /spidey.json
    if (pathname === "/spidey.json") {
      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      fs.createReadStream(projects[0].absPath)
        .on("error", (e) => {
          res.statusCode = 500;
          res.end(String(e));
        })
        .pipe(res);
      return;
    }

    if (pathname === "/") pathname = "/index.html";
    let filePath = path.join(dist, pathname);
    if (!filePath.startsWith(dist)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    if (!fileExists(filePath)) filePath = indexHtml;

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("content-type", MIME[ext] ?? "application/octet-stream");
    fs.createReadStream(filePath)
      .on("error", (e) => {
        res.statusCode = 500;
        res.end(String(e));
      })
      .pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve());
  });

  const viewerUrl = `http://localhost:${port}`;
  log.ok(`spidey viewer running at ${viewerUrl}`);
  if (projects.length === 1) {
    log.dim(`serving ${projects[0].absPath}`);
  } else {
    log.dim(`serving ${projects.length} projects:`);
    for (const p of projects) log.dim(`  ${p.id} → ${p.absPath}`);
  }

  if (open) openBrowser(viewerUrl);

  const shutdown = () => {
    server.close(() => {
      // Best-effort: tear down any cached dev servers / browsers so we
      // don't leave detached child processes after the view server
      // exits. The 500ms hard timeout below caps how long we wait.
      disposeRecaptureRuntimes().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}
