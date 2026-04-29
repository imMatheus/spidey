import { useCallback, useRef, useState } from "react";
import type { SpideyNode } from "@spidey/shared";
import { useEditorDispatch, useProject } from "../context";

/**
 * Re-render a component instance (i.e. a `<ColorBox>` rendered inside
 * a route tile, not the master) with new props. POSTs to the view
 * server's /recapture-instance endpoint, which runs the same
 * write-preview / Playwright capture / cleanup pipeline as the master
 * recapture but returns just the inner subtree. The hook then
 * dispatches `replaceSubtree` to splice it into the route tile in
 * place of the selected instance node.
 *
 * Returns:
 *   - `recapture(tileId, nodeId, componentName, propsUsed)` — fire and await
 *   - `pending` — whether a request is currently in flight
 *   - `error` — last error message (sticky until the next call clears it)
 *
 * Latest-wins: a stale request whose response arrives after a newer one
 * has already updated the editor is dropped. Without this, fast
 * successive edits could glitch the instance back to an older render.
 */
export function useInstanceRecapture(): {
  recapture: (
    tileId: string,
    nodeId: string,
    componentName: string,
    propsUsed: Record<string, unknown>,
    componentFile?: string,
  ) => Promise<void>;
  pending: boolean;
  error: string | null;
} {
  const { activeProjectId } = useProject();
  const dispatch = useEditorDispatch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const latestAppliedRef = useRef(0);

  const recapture = useCallback(
    async (
      tileId: string,
      nodeId: string,
      componentName: string,
      propsUsed: Record<string, unknown>,
      componentFile?: string,
    ) => {
      if (!activeProjectId) {
        setError("no active project");
        return;
      }
      const seq = ++seqRef.current;
      setPending(true);
      setError(null);
      try {
        const res = await fetch(
          `/spidey-projects/${activeProjectId}/recapture-instance`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              componentName,
              componentFile,
              propsUsed,
            }),
          },
        );
        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { subtree: SpideyNode };
        if (seq <= latestAppliedRef.current) return;
        latestAppliedRef.current = seq;
        dispatch({
          type: "replaceSubtree",
          tileId,
          nodeId,
          subtree: body.subtree,
        });
      } catch (e) {
        if (seq <= latestAppliedRef.current) return;
        setError((e as Error)?.message ?? String(e));
      } finally {
        if (seq === seqRef.current) setPending(false);
      }
    },
    [activeProjectId, dispatch],
  );

  return { recapture, pending, error };
}
