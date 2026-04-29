type LineKind = "add" | "del" | "hunk" | "meta" | "context";

export function renderDiff(patch: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  // skip the per-file header lines that createTwoFilesPatch emits as the
  // first 4 lines (===, ---, +++, blank) — the sidebar already shows the file
  // name above the diff block.
  const lines = patch.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kind = classify(line);
    if (kind === "meta") continue;
    const div = document.createElement("div");
    div.className = `diff-line ${kind}`;
    div.textContent = line.length > 0 ? line : " ";
    frag.appendChild(div);
  }
  return frag;
}

function classify(line: string): LineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("Index:") || line.startsWith("===")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}
