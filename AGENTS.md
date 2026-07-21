# AGENTS.md

## Cursor Cloud specific instructions

`spidey-sense` is a single TypeScript dev-tool library (Vite plugin, Next.js integration, and standalone CLI facets, plus a browser runtime). `examples/*` are host apps used only to dogfood the plugin. There is no database or backend service. Package manager is **Bun**; Node 18+ is required (Node 22 is available in this environment).

### Running / dev
- Standard dev/build/test scripts live in `package.json` (`build`, `dev`, `typecheck`) and in `scripts/dev.ts`; use those.
- `bun scripts/dev.ts [example]` is the all-in-one harness: it runs `tsup --watch` and boots one example. Default example is `vite-app`. It auto-runs `bun run build` first if `dist/inject.js` is missing.
- Ports: daemon HTTP+WS on `7878` (auto-bumps if taken), `examples/vite-app` on `5400`, `examples/next-app` and `examples/complex-app` on `5500`.
- The daemon serves the browser runtime from `dist/inject.js`/`dist/inject-diff.js`, so `dist/` must be built before it can serve `/spidey-sense.js` (the dev harness handles this).

### Non-obvious gotchas
- The Vite/Next plugin only boots the daemon (and injects the `<script>`) when a `claude` OR `codex` binary is found on PATH. `softFailOnMissingClaude` defaults to `true`, so with neither installed the plugin silently skips and the tool never appears in the browser. Install the agent CLI to see the tool: `bun install -g @anthropic-ai/claude-code` (provides `claude`).
- Actually applying edits requires the agent CLI to be authenticated (Claude Code login / `ANTHROPIC_API_KEY`, or Codex auth). Without auth, the full pick→prompt→job flow works but the job fails with "Not logged in - Please run /login". This is the expected terminal state when no agent credentials are configured.
- `bun run typecheck` currently fails with a pre-existing `TS6059` error (`tsup.config.ts` is not under `rootDir "src"`, but is in `tsconfig.json`'s `include`). This is unrelated to environment setup. There is no ESLint config; `typecheck` is the closest static check.
- `examples/*` are not Bun workspaces; each has its own `package.json` and must be installed separately. `vite-app`/`next-app` depend on the package via `file:../..`.
- `examples/complex-app` does NOT wire the plugin; test that path via the standalone CLI (`bun run start` / `npx spidey-sense --cwd examples/complex-app`) and paste the printed `<script>` tag.
