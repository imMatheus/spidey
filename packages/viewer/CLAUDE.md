# @spidey/viewer

UI for this package is built on **shadcn/ui** (Tailwind v4 + Radix). Always
prefer existing shadcn primitives over hand-rolled JSX.

## Adding a component
```sh
bunx --bun shadcn@latest add <name>
```
The init was run with the `b1PzeK` preset and the Vite template; reinitialize
only with the same preset to keep the look consistent.

## Color tokens
Use shadcn semantic classes only (`bg-background`, `bg-card`, `bg-muted`,
`bg-primary`, `text-foreground`, `text-muted-foreground`, `text-primary`,
`text-destructive`, `border-border`, `ring-ring`, ...). No legacy custom
tokens (`bg-panel`, `text-fg`, `text-accent`, `border-edge`, etc.) — those
were removed in favor of shadcn tokens. For accent shades that don't have a
direct token (success/warning), use Tailwind palette utilities directly
(`text-emerald-500`, `text-amber-500`, `text-pink-500`).

## Theme
`ThemeProvider` (`src/components/theme-provider.tsx`) controls light/dark/system
via the `dark` class on `<html>`. The user toggles via `ThemeToggle` in the
sidebar header. Default is `dark`, persisted to `localStorage` under
`spidey-viewer-theme`.

## Aliases
Path alias `@/*` → `src/*` is configured in `tsconfig.json` and
`vite.config.ts`. shadcn-generated files import from `@/components/ui/...`
and `@/lib/utils`.
