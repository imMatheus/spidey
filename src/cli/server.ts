import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { jobStore } from "./jobs";
import { runJob } from "./agent";
import { history } from "./history";
import { commitFiles, pushCurrentBranch } from "./git";
import { generateCommitMessage } from "./commit-message";
import type {
  CreateJobRequest,
  CreateJobResponse,
  JobHistoryListResponse,
  JobThreadCommitRequest,
  JobThreadCommitResponse,
  ServerEvent,
} from "../protocol";

export interface ServerOpts {
  port: number;
  cwd: string;
  claudeBin: string;
  codexBin: string;
  /** When true, if the requested port is taken, try the next ones (up to 20). */
  autoPort?: boolean;
  /** When true, install SIGINT/SIGTERM handlers that exit the process on shutdown. CLI only. */
  installSignalHandlers?: boolean;
  /** When true, print the banner with the script tag. CLI only. */
  printBanner?: boolean;
}

export interface ServerHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startServer(opts: ServerOpts): Promise<ServerHandle> {
  const injectPath = resolveInjectBundle();

  const httpServer = createServer((req, res) => {
    setCors(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || "/";

    if (req.method === "GET" && (url === "/" || url === "/health")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "spidey-grab", cwd: opts.cwd }));
      return;
    }

    if (req.method === "GET" && (url === "/spidey-grab.js" || url === "/inject.js")) {
      serveInjectBundle(res, injectPath);
      return;
    }

    if (req.method === "POST" && url === "/jobs") {
      handleCreateJob(req, res, opts);
      return;
    }

    if (req.method === "GET" && url === "/jobs/history") {
      const body: JobHistoryListResponse = { entries: history.list(opts.cwd) };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }

    const diffMatch = req.method === "GET" ? url.match(/^\/jobs\/([0-9a-f-]{8,})\/diff$/i) : null;
    if (diffMatch) {
      const bundle = history.read(opts.cwd, diffMatch[1]);
      if (!bundle) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "job not found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(bundle));
      return;
    }

    const threadMatch = req.method === "GET" ? url.match(/^\/jobs\/([0-9a-f-]{8,})\/thread$/i) : null;
    if (threadMatch) {
      const result = history.thread(opts.cwd, threadMatch[1]);
      if (!result) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "job not found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    const changesMatch = req.method === "GET" ? url.match(/^\/jobs\/([0-9a-f-]{8,})\/thread\/changes$/i) : null;
    if (changesMatch) {
      const result = history.aggregateChanges(opts.cwd, changesMatch[1]);
      if (!result) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "job not found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }

    const commitMatch = req.method === "POST" ? url.match(/^\/jobs\/([0-9a-f-]{8,})\/thread\/commit$/i) : null;
    if (commitMatch) {
      void handleCommitThread(req, res, opts, commitMatch[1]);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  // ws re-emits the underlying http server's errors. EADDRINUSE on first
  // listen would crash here otherwise; the http retry path handles them.
  wss.on("error", () => {});
  wss.on("connection", (socket) => {
    const hello: ServerEvent = { type: "hello", jobs: jobStore.list() };
    sendSafe(socket, hello);
    const unsubscribe = jobStore.subscribe((event) => sendSafe(socket, event));
    socket.on("close", unsubscribe);
    socket.on("error", () => {});
  });

  const port = await listenWithRetry(httpServer, opts.port, opts.autoPort ?? false);

  if (opts.printBanner !== false) {
    printBanner({ ...opts, port });
  }

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closing) return closing;
    closing = new Promise((resolveClose) => {
      jobStore.cancelAll();
      wss.close();
      httpServer.close(() => resolveClose());
      // hard-kill after a beat so we don't hang on lingering sockets
      setTimeout(() => resolveClose(), 1000).unref();
    });
    return closing;
  };

  if (opts.installSignalHandlers) {
    const shutdown = () => {
      void close().then(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  return { port, url: `http://localhost:${port}`, close };
}

function listenWithRetry(
  server: ReturnType<typeof createServer>,
  startPort: number,
  autoPort: boolean,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const maxAttempts = autoPort ? 20 : 1;
    let attempt = 0;
    let port = startPort;

    const tryListen = () => {
      const onError = (err: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        if (err.code === "EADDRINUSE" && ++attempt < maxAttempts) {
          port += 1;
          tryListen();
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port);
    };

    tryListen();
  });
}

function handleCreateJob(req: IncomingMessage, res: ServerResponse, opts: ServerOpts) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > 1_000_000) {
      req.destroy();
    }
  });
  req.on("end", () => {
    let parsed: CreateJobRequest;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid json" }));
      return;
    }
    if (!parsed?.prompt || typeof parsed.prompt !== "string") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "prompt is required" }));
      return;
    }
    const jobId = runJob(parsed, {
      cwd: opts.cwd,
      bins: { claude: opts.claudeBin, codex: opts.codexBin },
    });
    const body_: CreateJobResponse = { jobId };
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify(body_));
  });
}

async function handleCommitThread(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ServerOpts,
  jobId: string,
) {
  const raw = await readRequestBody(req, 100_000);
  let parsed: JobThreadCommitRequest = {};
  if (raw && raw.length > 0) {
    try {
      parsed = JSON.parse(raw) as JobThreadCommitRequest;
    } catch {
      // ignore — treat as no body
    }
  }

  const thread = history.thread(opts.cwd, jobId);
  if (!thread || thread.entries.length === 0) {
    const body: JobThreadCommitResponse = { ok: false, error: "thread not found" };
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  const aggregate = history.aggregateChanges(opts.cwd, jobId);
  const files = aggregate
    ? aggregate.changes.map((c) => c.file)
    : Array.from(new Set(thread.entries.flatMap((e) => e.diffs.map((d) => d.file))));
  if (files.length === 0) {
    const body: JobThreadCommitResponse = { ok: false, error: "no files in thread" };
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  const fallback = promptBasedMessage(thread.entries[0]);
  const generated = await generateCommitMessage(
    { cwd: opts.cwd, claudeBin: opts.claudeBin },
    thread,
    aggregate ? aggregate.changes : thread.entries.flatMap((e) => e.diffs),
    fallback,
  );

  const commitResult = commitFiles(opts.cwd, files, generated.message);
  const body: JobThreadCommitResponse = commitResult;

  if ((commitResult.ok || commitResult.nothingToCommit) && parsed.push) {
    const pushResult = pushCurrentBranch(opts.cwd);
    body.pushed = pushResult.ok;
    if (!pushResult.ok) body.pushError = pushResult.error;
  }

  res.writeHead(commitResult.ok || commitResult.nothingToCommit ? 200 : 500, {
    "content-type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: Buffer | string) => {
      raw += chunk.toString();
      if (raw.length > maxBytes) req.destroy();
    });
    req.on("end", () => resolve(raw));
    req.on("error", () => resolve(raw));
  });
}

function promptBasedMessage(root: { promptPreview?: string; prompt?: string; jobId: string }): string {
  const subject = (root.promptPreview || root.prompt || "spidey-grab changes")
    .split("\n")[0]
    .slice(0, 72);
  return `${subject}\n\nspidey-grab job ${root.jobId}`;
}

// Cache the bundle keyed by mtime+size so we don't re-read on every request,
// and — more importantly — don't serve a partially-written bundle while
// `tsup --watch` is mid-rebuild. esbuild's writer isn't atomic; a request
// that lands during the write window would otherwise stream half a file and
// the browser parses it with "Invalid or unexpected token".
let bundleCache: { mtimeMs: number; size: number; content: Buffer } | null = null;

function readInjectBundleSafe(injectPath: string): Buffer | null {
  if (!existsSync(injectPath)) return null;
  const stat = statSync(injectPath);
  if (
    bundleCache &&
    bundleCache.mtimeMs === stat.mtimeMs &&
    bundleCache.size === stat.size
  ) {
    return bundleCache.content;
  }
  // Read, then re-stat. If size/mtime moved between stat→read→re-stat,
  // a write was in flight — fall back to the previous good cache instead
  // of serving a torn read.
  const content = readFileSync(injectPath);
  const after = statSync(injectPath);
  if (
    after.mtimeMs !== stat.mtimeMs ||
    after.size !== stat.size ||
    content.length !== stat.size
  ) {
    return bundleCache?.content ?? null;
  }
  bundleCache = { mtimeMs: stat.mtimeMs, size: stat.size, content };
  return content;
}

function serveInjectBundle(res: ServerResponse, injectPath: string) {
  const content = readInjectBundleSafe(injectPath);
  if (!content) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`spidey-grab inject bundle not ready at ${injectPath}. Run 'npm run build' in the spidey-grab package, or wait for tsup --watch to finish its first build.`);
    return;
  }
  res.writeHead(200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(content);
}

function setCors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function sendSafe(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState !== socket.OPEN) return;
  try {
    socket.send(JSON.stringify(event));
  } catch {
    // ignore
  }
}

function resolveInjectBundle(): string {
  // Dev runs the CLI from src/cli/ via bun --watch, so the relative path
  // wouldn't land on dist/inject.js — let the dev orchestrator point at the
  // built bundle explicitly.
  if (process.env.SPIDEY_GRAB_INJECT_BUNDLE) return process.env.SPIDEY_GRAB_INJECT_BUNDLE;
  // tsup's `shims: true` provides __dirname in both CJS (native) and ESM
  // (shimmed). Both built locations (dist/cli/ and dist/plugin/) sit one
  // level under dist/, so the relative resolution is the same.
  return resolve(__dirname, "..", "inject.js");
}

function printBanner(opts: ServerOpts) {
  const tag = `<script src="http://localhost:${opts.port}/spidey-grab.js"></script>`;
  const lines = [
    "",
    "  spidey-grab is running",
    "",
    `  port: ${opts.port}`,
    `  cwd:  ${opts.cwd}`,
    `  claude: ${opts.claudeBin}`,
    `  codex:  ${opts.codexBin}`,
    "",
    "  paste this into your app's <head>:",
    "",
    `    ${tag}`,
    "",
    "  ctrl+c to stop",
    "",
  ];
  process.stdout.write(lines.join("\n") + "\n");
}
