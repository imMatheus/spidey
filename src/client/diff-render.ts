import { FileDiff, preloadHighlighter, processFile } from "@pierre/diffs";
import "@pierre/diffs/web-components";

// Languages spidey-grab actively highlights. Each one costs ~100 KB minified
// in the lazy diff bundle because the IIFE format inlines all dynamic imports.
// Anything not registered here renders as plain text (still readable). Add
// sparingly — keep the list to file types that are common in React/Vite/Next
// apps and that benefit meaningfully from highlighting.
const HIGHLIGHTER_OPTS = {
  themes: ["github-light"] as const,
  langs: ["typescript", "javascript", "tsx", "jsx", "json", "css", "html", "markdown"] as const,
  preferredHighlighter: "shiki-js" as const,
};

let highlighterPromise: Promise<void> | undefined;
function ensureHighlighter(): Promise<void> {
  if (!highlighterPromise) {
    highlighterPromise = preloadHighlighter({
      themes: [...HIGHLIGHTER_OPTS.themes],
      langs: [...HIGHLIGHTER_OPTS.langs],
      preferredHighlighter: HIGHLIGHTER_OPTS.preferredHighlighter,
    });
  }
  return highlighterPromise;
}

export function renderDiff(patch: string): HTMLElement {
  const host = document.createElement("div");
  host.className = "diff-host";

  const fileDiff = processFile(dedentPatch(patch));
  if (!fileDiff) {
    host.textContent = patch;
    return host;
  }

  const component = new FileDiff({
    disableFileHeader: true,
    diffStyle: "unified",
    overflow: "wrap",
    hunkSeparators: "simple",
    theme: "github-light",
    themeType: "light",
    preferredHighlighter: HIGHLIGHTER_OPTS.preferredHighlighter,
  });

  const renderInto = () => {
    component.render({ fileDiff, containerWrapper: host });
  };

  renderInto();
  ensureHighlighter().then(renderInto).catch(() => {});

  return host;
}

// Strip the common leading whitespace from each hunk so visually-indented
// code lines up at column 0 in the rendered diff.
function dedentPatch(patch: string): string {
  const lines = patch.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("@@")) {
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith("@@")) j++;
      dedentHunk(lines, i + 1, j);
      i = j;
    } else {
      i++;
    }
  }
  return lines.join("\n");
}

function dedentHunk(lines: string[], start: number, end: number): void {
  let common: string | null = null;
  for (let k = start; k < end; k++) {
    const l = lines[k];
    if (l.length === 0) continue;
    const c = l[0];
    if (c !== "+" && c !== "-" && c !== " ") continue;
    const content = l.slice(1);
    if (content.trim() === "") continue;
    const indent = /^[ \t]*/.exec(content)?.[0] ?? "";
    common = common === null ? indent : commonPrefix(common, indent);
    if (common === "") return;
  }
  if (!common) return;
  const len = common.length;
  for (let k = start; k < end; k++) {
    const l = lines[k];
    if (l.length === 0) continue;
    const c = l[0];
    if (c !== "+" && c !== "-" && c !== " ") continue;
    const content = l.slice(1);
    if (content.length < len) continue;
    lines[k] = c + content.slice(len);
  }
}

function commonPrefix(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}
