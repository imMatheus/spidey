# 🕷 Spidey

![Spidey](./spidey.png)

Turn any local Vite or Next.js TypeScript app into a Figma-style canvas of all its screens.

```bash
spidey generate ./my-app    # produces spidey.json
spidey view spidey.json     # opens the canvas viewer
```

The JSON is a static, portable artifact. Commit it, share it, diff it across branches.

---

## Install (this repo, local dev)

```bash
# 1. Install deps for all workspaces
bun install

# 2. Install the Chromium browser Playwright drives
bunx playwright install chromium

# 3. Build the viewer bundle (served by `spidey view`)
bun run build

# 4. Make the `spidey` command available globally
cd packages/cli && bun link && cd ../..
bun link spidey
```

You should now have a `spidey` binary on your `$PATH`.

---

## Try it on the bundled examples

```bash
spidey generate ./examples/vite-app -o vite.spidey.json
spidey view vite.spidey.json
```

```bash
spidey generate ./examples/next-app -o next.spidey.json
spidey view next.spidey.json
```

---

## How it works

`spidey generate <path>`:
1. Detects the framework (Vite vs Next App Router).
2. Discovers every static route — Next by walking `app/`, Vite by AST-parsing the React Router config.
3. Substitutes placeholder values for dynamic params (`/users/[id]` → `/users/1`).
4. Boots the project's dev server (`<your pm> run dev`) and waits for it to print a localhost URL.
5. Drives a headless Chromium with Playwright to visit each route, wait for `networkidle`, and grab full HTML + inlined CSS.
6. Writes everything to a single `spidey.json` and shuts the dev server down cleanly.

`spidey view <spidey.json>`:
- Starts a small static server on port 4321 (configurable with `--port`).
- Serves the prebuilt React + Vite viewer.
- The viewer fetches the JSON, lays out every page on an infinite pan/zoom canvas, and mounts each tile inside a Shadow DOM root for full style isolation. No iframes.

---

## Scope (v0)

**In:**
- Vite + React + TypeScript apps (using `react-router-dom`)
- Next.js App Router + TypeScript apps
- Auto-discovery of all static routes
- Auto-substituted placeholders for dynamic params
- Full rendered HTML + inlined CSS per page
- Pan, zoom, sidebar of all pages, viewport size selector

**Out (deferred):**
- State or conditional toggles (renders default state)
- API mocking (real requests run during capture; broken states are fine)
- Image inlining (images may 404 in the viewer — acceptable for v0)
- Pages Router (Next.js)
- Auth-protected routes
- Annotations / comments

---

## Repo layout

```
packages/
  shared/   types describing the spidey.json schema
  cli/      the spidey binary (generate, view)
  viewer/   the Figma-style canvas (built into a static bundle)
examples/
  vite-app/   tiny Vite + react-router-dom demo (~4 routes)
  next-app/   tiny Next App Router demo (~5 routes incl. dynamic [slug])
```

---

## CLI reference

```
spidey generate <path> [--output spidey.json]
spidey view <spidey.json> [--port 4321] [--no-open]
```

| Flag           | Default        | Notes                                        |
| -------------- | -------------- | -------------------------------------------- |
| `--output, -o` | `spidey.json`  | Path to write the captured artifact          |
| `--port, -p`   | `4321`         | Port for the viewer server                   |
| `--no-open`    | (auto-opens)   | Skip launching the browser                   |

`SPIDEY_DEBUG=1` prints full stack traces on errors.

---

## Viewer controls

- **Drag** anywhere to pan
- **⌘/Ctrl + scroll** to zoom (cursor-anchored)
- **Scroll** without modifier to pan
- **Click a route** in the sidebar to center and zoom that tile
- **Search** filters the sidebar by route or title
- **+ / − / fit** controls in the lower-right corner
