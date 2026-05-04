# 🕷 Spidey

![Spidey](./spidey.png)

Click any element in your local React app, type "make it red", get a Claude Code
agent to edit the source on disk. Multiple jobs run concurrently with per-element
status badges so you can keep working while edits land.

## Usage

```bash
cd /path/to/your/react/app
npx spidey-grab
```

The CLI prints a `<script>` tag — paste it into the `<head>` of your app
(before your React entry script) and refresh the browser. A button appears in
the bottom-right.

```html
<script src="http://localhost:7878/spidey-grab.js"></script>
```

1. Click the button to enter pick mode.
2. Hover any element on the page; click to select.
3. Type a natural-language prompt and press Enter.
4. The element keeps a colored outline + status badge while a Claude agent runs.
5. Repeat — multiple jobs run in parallel.

## Requirements

- Node 18+
- The local `claude` CLI on PATH (or `--claude-bin /path/to/claude`).
- A React dev build (source mapping requires `_debugSource`, available in dev only).

## Flags

- `--port <n>` — port to listen on (default `7878`).
- `--cwd <path>` — repo root passed to spawned `claude` jobs (default: cwd).
- `--claude-bin <path>` — override the `claude` binary location.

## Development

```bash
bun install
bun run --cwd packages/spidey-grab build
node packages/spidey-grab/bin/spidey-grab.cjs --cwd examples/vite-app
```
