import { useEffect } from "react";
import {
  useEditorDispatch,
  useEditorState,
  useSelection,
  useSelectionActions,
} from "../context";

/** Global keyboard shortcuts for the editor: tool letter-keys, undo/redo,
 *  delete/duplicate/copy/cut/paste on the selected node, Esc walk-up,
 *  and Alt-press tracking for distance overlays.
 *
 *  Plain-letter shortcuts are blocked while the user is typing in an
 *  input/contenteditable so they don't fight typing. Cmd/Ctrl shortcuts
 *  fire even inside inputs, except for clipboard letters (C/X/V/D) which
 *  must defer to the input's native handling. */
export function useEditorKeyboard() {
  const dispatch = useEditorDispatch();
  const { activeTileId, selectedNodeId } = useSelection();
  const {
    setSelectedNodeId,
    setHoveredNodeId,
    setActiveTileId,
    setAltPressed,
  } = useSelectionActions();
  // Latest editor state (clipboard + tileTrees) — read inline rather than
  // memoized over deps so handlers always see live values.
  const editor = useEditorState();

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltPressed(true);

      const tag =
        (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;

      // Undo / redo work even when typing in an input — the editor reducer
      // owns this history (browsers' native undo is per-input only).
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.altKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }

      // Delete selected node — only when not typing.
      if (
        !inField &&
        (e.key === "Backspace" || e.key === "Delete") &&
        activeTileId &&
        selectedNodeId
      ) {
        e.preventDefault();
        dispatch({ type: "removeNode", tileId: activeTileId, nodeId: selectedNodeId });
        setSelectedNodeId(null);
        return;
      }
      // Cmd-D duplicate. Node-level shortcuts must not fire while typing
      // in an inspector field.
      if (
        !inField &&
        meta &&
        (e.key === "d" || e.key === "D") &&
        activeTileId &&
        selectedNodeId
      ) {
        e.preventDefault();
        dispatch({
          type: "duplicateNode",
          tileId: activeTileId,
          nodeId: selectedNodeId,
        });
        return;
      }
      // Cmd-C / Cmd-X copy/cut.
      if (
        !inField &&
        meta &&
        (e.key === "c" || e.key === "C") &&
        activeTileId &&
        selectedNodeId
      ) {
        dispatch({ type: "copyNode", tileId: activeTileId, nodeId: selectedNodeId });
        return;
      }
      if (
        !inField &&
        meta &&
        (e.key === "x" || e.key === "X") &&
        activeTileId &&
        selectedNodeId
      ) {
        e.preventDefault();
        dispatch({ type: "cutNode", tileId: activeTileId, nodeId: selectedNodeId });
        setSelectedNodeId(null);
        return;
      }
      // Cmd-V paste-as-child of selection (or root if no selection).
      if (
        !inField &&
        meta &&
        (e.key === "v" || e.key === "V") &&
        activeTileId &&
        editor.clipboard
      ) {
        e.preventDefault();
        const tree = editor.tileTrees[activeTileId];
        const parentId = selectedNodeId ?? tree?.id;
        if (parentId) {
          dispatch({ type: "pasteAsChild", tileId: activeTileId, parentId });
        }
        return;
      }

      if (inField) return; // single-letter tool shortcuts only outside inputs

      switch (e.key) {
        case "v":
        case "V":
          dispatch({ type: "setTool", tool: "select" });
          break;
        case "h":
        case "H":
          dispatch({ type: "setTool", tool: "hand" });
          break;
        case "t":
        case "T":
          dispatch({ type: "setTool", tool: "text" });
          break;
        case "b":
        case "B":
          dispatch({ type: "setTool", tool: "rect" });
          break;
        case "i":
        case "I":
          dispatch({ type: "setTool", tool: "image" });
          break;
        case "Escape":
          if (selectedNodeId) {
            setSelectedNodeId(null);
            setHoveredNodeId(null);
          } else if (activeTileId) {
            setActiveTileId(null);
          }
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltPressed(false);
    };
    const onBlur = () => setAltPressed(false);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    activeTileId,
    selectedNodeId,
    editor.clipboard,
    editor.tileTrees,
    dispatch,
    setSelectedNodeId,
    setHoveredNodeId,
    setActiveTileId,
    setAltPressed,
  ]);
}
