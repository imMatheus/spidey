# 🕷 Spidey Grab

![Spidey](https://raw.githubusercontent.com/imMatheus/spidey/main/spidey.png)

Click any element in your local React app, type "make it red", get a Claude
Code agent to edit the source on disk. Multiple jobs run concurrently with
per-element status badges so you can keep working while edits land.

## Install

```bash
npm install -D spidey-grab
```

### Vite

Add the plugin to your `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import spideyGrab from "spidey-grab/vite";

export default defineConfig({
  plugins: [react(), spideyGrab()],
});
```

### Next.js

Two pieces — wrap your `next.config.{js,mjs,ts}` and drop a component into
your root layout:

```js
// next.config.mjs
import { withSpideyGrab } from "spidey-grab/next";
export default withSpideyGrab({});
```

```tsx
// app/layout.tsx (App Router)
import { SpideyGrab } from "spidey-grab/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <head><SpideyGrab /></head>
      <body>{children}</body>
    </html>
  );
}
```

For the Pages Router, put `<SpideyGrab />` inside the `<Head>` of your
`pages/_document.tsx` instead.

---

Run your dev server like normal — `npm run dev`. The plugin boots the
spidey-grab daemon in the same process and injects the runtime script in
dev only. No second terminal, no manual `<script>` paste, and nothing ships
to production builds.

A button appears in the bottom-right of your app:

1. Click it to enter pick mode.
2. Hover any element on the page; click to select.
3. Type a natural-language prompt and press Enter.
4. The element keeps a colored outline + status badge while a Claude agent runs.
5. Repeat — multiple jobs run in parallel.

## Requirements

- Node 18+
- The local `claude` CLI on PATH (or pass `claudeBin` to the plugin).
- A React dev build (source mapping requires `_debugSource`, available in dev only).

## Plugin options

```ts
spideyGrab({
  port: 7878,                    // default; auto-bumps if taken
  cwd: undefined,                // repo root for `claude` jobs (defaults to vite root)
  claudeBin: "claude",           // path to the claude binary
  codexBin: "codex",             // path to the codex binary (optional agent)
  softFailOnMissingClaude: true, // log a warning instead of failing if claude isn't installed
  disabled: false,               // skip plugin entirely (useful for env-gated configs)
});
```

## Standalone CLI (no Vite)

For projects without a supported bundler, you can still run the daemon
directly and paste the printed `<script>` tag into your app's `<head>` (in
dev only):

```bash
npx spidey-grab --cwd /path/to/your/repo
```

CLI flags:

- `--port <n>` — port to listen on (default `7878`).
- `--cwd <path>` — repo root passed to spawned `claude` jobs.
- `--claude-bin <path>` — override the `claude` binary location.
- `--codex-bin <path>` — override the `codex` binary location.

## Other bundlers

For projects using Webpack/CRA/Parcel directly (without Next), use the
standalone CLI and add the printed `<script>` to your dev-only HTML.
A first-class Webpack plugin is on the roadmap — PRs welcome.

## Development

```bash
bun install
bun run build
bun scripts/dev.ts            # all-in-one dev harness for the example app
```

## License

MIT
