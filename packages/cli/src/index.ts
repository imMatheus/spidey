import path from "node:path";
import { runGenerate } from "./commands/generate.js";
import { runView } from "./commands/view.js";
import { log } from "./util.js";

const HELP = `
spidey — turn a local Vite or Next.js app into a Figma-style canvas of every screen

USAGE
  spidey generate <path> [--output spidey.json]
  spidey view <spidey.json> [--port 4321] [--no-open]

COMMANDS
  generate    Discover routes, capture rendered HTML+CSS, write spidey.json
  view        Serve the canvas viewer pointed at a spidey.json

OPTIONS
  --output, -o   Output path for generate (default: spidey.json)
  --port, -p     Port for view (default: 4321)
  --no-open      Don't auto-open the browser when starting the viewer
  --help, -h     Show this help

EXAMPLES
  spidey generate ./my-app
  spidey view spidey.json
`;

type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (key.startsWith("no-")) {
          flags[key.slice(3)] = false;
        } else if (next != null && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (a.startsWith("-") && a.length > 1) {
      const short = a.slice(1);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("-")) {
        flags[short] = next;
        i++;
      } else {
        flags[short] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    console.log(HELP);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const cmd = argv[0];
  const rest = argv.slice(1);
  const { positional, flags } = parseArgs(rest);

  if (flags.help || flags.h) {
    console.log(HELP);
    return;
  }

  try {
    switch (cmd) {
      case "generate": {
        const projectPath = positional[0];
        if (!projectPath) {
          log.err("generate: missing project path");
          console.log("\n" + HELP);
          process.exit(2);
        }
        const output =
          (flags.output as string) ??
          (flags.o as string) ??
          path.resolve("spidey.json");
        await runGenerate({ projectPath, outputPath: output });
        break;
      }
      case "view": {
        const jsonPath = positional[0] ?? "spidey.json";
        const port = Number(flags.port ?? flags.p ?? 4321);
        const open = flags.open !== false;
        await runView({ jsonPath, port, open });
        break;
      }
      default:
        log.err(`unknown command: ${cmd}`);
        console.log(HELP);
        process.exit(2);
    }
  } catch (e: any) {
    log.err(e?.message ?? String(e));
    if (process.env.SPIDEY_DEBUG) console.error(e);
    process.exit(1);
  }
}

main();
