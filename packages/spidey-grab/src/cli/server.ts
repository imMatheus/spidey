import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

interface ServerOpts {
  port: number;
  cwd: string;
  claudeBin: string;
}

export function startServer(opts: ServerOpts) {
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
  wss.on("connection", (socket) => {
    const hello: ServerEvent = { type: "hello", jobs: jobStore.list() };
    sendSafe(socket, hello);
    const unsubscribe = jobStore.subscribe((event) => sendSafe(socket, event));
    socket.on("close", unsubscribe);
    socket.on("error", () => {});
  });

  httpServer.listen(opts.port, () => {
    printBanner(opts);
  });

  const shutdown = () => {
    jobStore.cancelAll();
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
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
    const jobId = runJob(parsed, { cwd: opts.cwd, claudeBin: opts.claudeBin });
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

  if (commitResult.ok && parsed.push) {
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

function serveInjectBundle(res: ServerResponse, injectPath: string) {
  if (!existsSync(injectPath)) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`spidey-grab inject bundle not found at ${injectPath}. Run 'bun run build' in packages/spidey-grab.`);
    return;
  }
  const content = readFileSync(injectPath);
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
  const here = typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "inject.js");
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
