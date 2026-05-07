import type { AgentKind, CreateJobRequest, JobDiffBundle } from "../protocol";

export interface BuildPromptCtx {
  agent: AgentKind;
  /** All prior bundles in this thread, oldest-first. Only consulted for codex
   *  continuations (claude resumes via session id). */
  thread?: JobDiffBundle[];
}

export function buildPrompt(req: CreateJobRequest, ctx: BuildPromptCtx): string {
  if (req.parentJobId) {
    return ctx.agent === "codex"
      ? buildCodexContinuation(req, ctx.thread ?? [])
      : // Claude resumes via --resume <sessionId> and already has the full
        // prior turn list in scope, so we just forward the new user message.
        req.prompt;
  }
  return buildFreshPrompt(req);
}

function buildFreshPrompt(req: CreateJobRequest): string {
  const { prompt, source, context } = req;
  const sourceLine = source
    ? `${source.file}${source.line ? `:${source.line}` : ""}${source.column ? `:${source.column}` : ""}`
    : "(unknown — locate by component name + text content)";

  const classes = context && context.classes.length ? context.classes.join(" ") : "(none)";
  const text = context?.textPreview ? `"${context.textPreview}"` : "(empty)";
  const component = context?.displayName ?? "(unknown)";
  const tag = context?.tagName ? context.tagName.toLowerCase() : "(unknown)";

  return `The user is editing a React app via a visual element picker. They clicked a specific element on the page and want this change applied to its source.

USER REQUEST: ${prompt}

TARGET ELEMENT:
- Source: ${sourceLine}
- DOM tag: <${tag}>
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

/** Codex doesn't keep a session across our spawn boundary, so we hand it the
 *  prior turns (prompts + which files were touched) as plain context. */
function buildCodexContinuation(req: CreateJobRequest, thread: JobDiffBundle[]): string {
  if (thread.length === 0) {
    // Fallback — shouldn't happen but stay safe.
    return req.prompt;
  }

  const root = thread[0];
  const earlier = thread; // includes the parent we're continuing from
  const sourceLine = root.target?.source
    ? `${root.target.source.file}${root.target.source.line ? `:${root.target.source.line}` : ""}`
    : "(see prior turns)";

  const turnLines = earlier.map((bundle, i) => {
    const filesEdited = bundle.diffs.map((d) => d.file);
    const filesPart = filesEdited.length
      ? `\n   Files touched: ${filesEdited.join(", ")}`
      : "";
    return `${i + 1}. ${bundle.prompt.trim()}${filesPart}`;
  });

  return `The user is continuing a thread of edits on a React component via a visual element picker.

ORIGINAL TARGET:
- Source: ${sourceLine}
- React component: ${root.target?.displayName ?? "(unknown)"}

PRIOR TURNS IN THIS THREAD (oldest first):
${turnLines.join("\n")}

NEW USER REQUEST: ${req.prompt}

INSTRUCTIONS:
- Apply the new request minimally, scoped to the same element/component as the prior turns unless the user explicitly asks otherwise.
- The files edited in earlier turns are likely the right place to look first.
- Do not reformat unrelated code.
- Make the edit directly to the file.`;
}
