import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { startServer } from "./server";

interface CliOpts {
  port: number;
  cwd: string;
  claudeBin: string;
  codexBin: string;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    port: 7878,
    cwd: process.cwd(),
    claudeBin: "claude",
    codexBin: "codex",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0 || n > 65535) {
        die(`invalid --port value: ${v}`);
      }
      opts.port = n;
    } else if (arg === "--cwd") {
      const v = argv[++i];
      if (!v) die("--cwd requires a path");
      opts.cwd = resolve(v);
    } else if (arg === "--claude-bin") {
      const v = argv[++i];
      if (!v) die("--claude-bin requires a path");
      opts.claudeBin = v;
    } else if (arg === "--codex-bin") {
      const v = argv[++i];
      if (!v) die("--codex-bin requires a path");
      opts.codexBin = v;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--version" || arg === "-v") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require("../../package.json");
      process.stdout.write(`${pkg.version}\n`);
      process.exit(0);
    } else if (arg.startsWith("-")) {
      die(`unknown flag: ${arg}`);
    }
  }

  return opts;
}

function printHelp() {
  process.stdout.write(
    [
      "usage: spidey-grab [options]",
      "",
      "options:",
      "  --port <n>        port to listen on (default: 7878)",
      "  --cwd <path>      repo root for spawned claude jobs (default: process.cwd())",
      "  --claude-bin <p>  path to the claude binary (default: 'claude' on PATH)",
      "  --codex-bin <p>   path to the codex binary (default: 'codex' on PATH)",
      "  -h, --help        show this help",
      "  -v, --version     print version",
      "",
    ].join("\n") + "\n",
  );
}

function die(msg: string): never {
  process.stderr.write(`spidey-grab: ${msg}\n`);
  process.exit(1);
}

function checkClaude(claudeBin: string) {
  const probe = spawnSync(claudeBin, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    process.stderr.write(
      [
        `spidey-grab: could not run '${claudeBin} --version'.`,
        "",
        "this tool spawns the local 'claude' CLI to run agent jobs.",
        "install Claude Code from https://docs.claude.com/claude-code, or pass --claude-bin <path>.",
        "",
      ].join("\n") + "\n",
    );
    process.exit(1);
  }
}

const opts = parseArgs(process.argv.slice(2));
checkClaude(opts.claudeBin);
startServer({ ...opts, installSignalHandlers: true, printBanner: true }).catch((err) => {
  process.stderr.write(`spidey-grab: ${err?.message || err}\n`);
  process.exit(1);
});
