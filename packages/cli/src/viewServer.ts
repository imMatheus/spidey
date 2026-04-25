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
  // packages/cli/src → ../../viewer/dist
  const candidates = [
    path.resolve(__dirname, "../../viewer/dist"),
    path.resolve(__dirname, "../viewer/dist"),
  ];
  for (const c of candidates) if (dirExists(c)) return c;
  return null;
}

export async function startViewer({
  jsonPath,
  port,
  open,
}: {
  jsonPath: string;
  port: number;
  open: boolean;
}): Promise<void> {
  const absJson = path.resolve(jsonPath);
  if (!fileExists(absJson)) {
    throw new Error(`spidey.json not found: ${absJson}`);
  }

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

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/spidey.json") {
      res.setHeader("content-type", MIME[".json"]);
      res.setHeader("cache-control", "no-store");
      fs.createReadStream(absJson)
        .on("error", (e) => {
          res.statusCode = 500;
          res.end(String(e));
        })
        .pipe(res);
      return;
    }

    if (pathname === "/") pathname = "/index.html";

    let filePath = path.join(dist, pathname);
    // Block traversal
    if (!filePath.startsWith(dist)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }

    if (!fileExists(filePath)) {
      // SPA fallback to index.html
      filePath = indexHtml;
    }

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
  log.dim(`serving ${absJson}`);

  if (open) openBrowser(viewerUrl);

  // Handle shutdown
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
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
