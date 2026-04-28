import { useCallback, useRef, useState } from "react";
import type { SpideyTile } from "@spidey/shared";
import { useEditorDispatch, useProject } from "../context";

/**
 * Re-render a component master tile with new propsUsed. POSTs to the
 * view server's /recapture endpoint (which writes a fresh preview file,
 * runs Playwright through it on a cached dev server + browser, and
 * returns the new tile), then atomically swaps both the editor's
 * tile-tree and the doc's tile entry.
 *
 * Returns:
 *   - `recapture(tileId, propsUsed)` — fire and await
 *   - `pending` — whether a request is currently in flight
 *   - `error` — last error message (sticky until the next call clears it)
 *
 * Latest-wins: a stale request whose response arrives after a newer one
 * has already updated the editor is dropped on the floor. Without this,
 * fast successive edits could glitch the tile back to an older render.
 */
export function useRecapture(): {
  recapture: (
    tileId: string,
    propsUsed: Record<string, unknown>,
  ) => Promise<void>;
  pending: boolean;
  error: string | null;
} {
  const { activeProjectId, updateTile } = useProject();
  const dispatch = useEditorDispatch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonically-incremented request id; we only apply a response if
  // its id matches the latest sent.
  const seqRef = useRef(0);
  const latestAppliedRef = useRef(0);

  const recapture = useCallback(
    async (tileId: string, propsUsed: Record<string, unknown>) => {
      if (!activeProjectId) {
        setError("no active project");
        return;
      }
      const seq = ++seqRef.current;
      setPending(true);
      setError(null);
      // Optimistic propsUsed update: the section reads `parsed` from
      // the doc, so without this the user's inputs would snap back to
      // the old values until the server roundtrip resolves (1–2s of
      // perceived input lag). We update propsUsed in the doc now; the
      // server response later replaces the tree (and re-sets propsUsed
      // to the same value — harmless idempotent overwrite).
      updateTile(tileId, (prev) =>
        prev.component
          ? { ...prev, component: { ...prev.component, propsUsed } }
          : prev,
      );
      try {
        const res = await fetch(
          `/spidey-projects/${activeProjectId}/recapture`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tileId, propsUsed }),
          },
        );
        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { tile: SpideyTile };
        if (seq <= latestAppliedRef.current) return;
        latestAppliedRef.current = seq;
        if (body.tile.tree) {
          dispatch({
            type: "replaceTileTree",
            tileId,
            tree: body.tile.tree,
          });
        }
        // Replace the whole tile with the server's version (which
        // includes the freshly-captured tree, css, containerSize, etc.)
        // — keeps any client-only fields the server didn't set.
        updateTile(tileId, (prev) => ({ ...prev, ...body.tile }));
      } catch (e) {
        if (seq <= latestAppliedRef.current) return;
        setError((e as Error)?.message ?? String(e));
      } finally {
        if (seq === seqRef.current) setPending(false);
      }
    },
    [activeProjectId, dispatch, updateTile],
  );

  return { recapture, pending, error };
}
