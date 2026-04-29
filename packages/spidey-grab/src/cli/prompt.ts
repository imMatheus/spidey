import type { CreateJobRequest } from "../protocol";

export function buildPrompt(req: CreateJobRequest): string {
  const { prompt, source, context } = req;
  const sourceLine = source
    ? `${source.file}${source.line ? `:${source.line}` : ""}${source.column ? `:${source.column}` : ""}`
    : "(unknown — locate by component name + text content)";

  const classes = context.classes.length ? context.classes.join(" ") : "(none)";
  const text = context.textPreview ? `"${context.textPreview}"` : "(empty)";
  const component = context.displayName ?? "(unknown)";

  return `The user is editing a React app via a visual element picker. They clicked a specific element on the page and want this change applied to its source.

USER REQUEST: ${prompt}

TARGET ELEMENT:
- Source: ${sourceLine}
- DOM tag: <${context.tagName.toLowerCase()}>
- CSS classes: ${classes}
- React component: ${component}
- Text preview: ${text}

INSTRUCTIONS:
- Open the source file and locate the element on the indicated line.
- Apply the requested change minimally and scoped to that element only.
- Do not reformat unrelated code.
- If the source line is unknown, use the component name and text preview to find the right element.
- Make the edit directly to the file.`;
}
