import { useEffect, useState } from "react";
import type { SpideyDocument } from "@spidey/shared";
import {
  useEditorDispatch,
  useEditorState,
  useProject,
} from "../context";
import type { SaveStatus } from "../EditorToolbar";

const SAVE_DEBOUNCE_MS = 500;

/** Debounced autosave: PUTs the merged document back to the server when
 *  the editor goes dirty. Returns the in-flight save status (idle/saving/
 *  saved/error) for UI display. */
export function useAutoSave(): SaveStatus {
  const editor = useEditorState();
  const dispatch = useEditorDispatch();
  const { activeProjectId, doc, status, setDoc } = useProject();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  // Reset save badge whenever we switch projects so a stale "saved" tick
  // from the previous project doesn't carry over.
  useEffect(() => {
    setSaveStatus({ kind: "idle" });
  }, [activeProjectId]);

  useEffect(() => {
    if (!editor.dirty) return;
    if (status.kind !== "ready" || !doc) return;
    if (activeProjectId == null) return;

    setSaveStatus({ kind: "saving" });
    const handle = window.setTimeout(async () => {
      const editedAt = new Date().toISOString();
      const tilesOut = (doc.tiles ?? []).map((t) => ({
        ...t,
        tree: editor.tileTrees[t.id] ?? t.tree ?? null,
      }));
      const body: SpideyDocument = {
        ...doc,
        version: 3,
        editedAt,
        tiles: tilesOut,
        pages: undefined,
      };
      try {
        const res = await fetch(`/spidey-projects/${activeProjectId}.json`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setDoc(body);
        dispatch({ type: "markSaved" });
        setSaveStatus({ kind: "saved", at: Date.now() });
        window.setTimeout(() => {
          setSaveStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s));
        }, 1500);
      } catch (e: any) {
        setSaveStatus({ kind: "error", message: String(e?.message ?? e) });
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [
    editor.dirty,
    editor.tileTrees,
    doc,
    status,
    activeProjectId,
    dispatch,
    setDoc,
  ]);

  return saveStatus;
}
