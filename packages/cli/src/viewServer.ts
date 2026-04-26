import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import { dirExists, fileExists, log } from "./util.js";

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
    server.close(() => process.exit(0));
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
