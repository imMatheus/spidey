import {
  createContext,
  useContext,
  useReducer,
  useMemo,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  reducer,
  makeInitialState,
  type EditorState,
  type EditAction,
} from "../editor/state";

// State and dispatch live in separate contexts so components that only
// dispatch (most of them) don't re-render on every edit.
const StateContext = createContext<EditorState | null>(null);
const DispatchContext = createContext<Dispatch<EditAction> | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined as never, () =>
    makeInitialState({}),
  );
  return (
    <DispatchContext.Provider value={dispatch}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </DispatchContext.Provider>
  );
}

export function useEditorState(): EditorState {
  const v = useContext(StateContext);
  if (!v) throw new Error("useEditorState used outside EditorProvider");
  return v;
}

export function useEditorDispatch(): Dispatch<EditAction> {
  const v = useContext(DispatchContext);
  if (!v) throw new Error("useEditorDispatch used outside EditorProvider");
  return v;
}

/** Editor revision — bumped on every mutation. Cheap selector for consumers
 *  that only need to invalidate effects/memos and don't care about the rest
 *  of editor state. (Still triggers a re-render via state subscription —
 *  React contexts don't support real selectors, but it's at least an
 *  expressive signal.) */
export function useEditorRev(): number {
  return useEditorState().rev;
}

/** Per-tile tree selector. Returns the working-copy tree for the given
 *  tile, or null when the tile hasn't been initialized. */
export function useTileTree(tileId: string | null) {
  const state = useEditorState();
  return useMemo(() => {
    if (!tileId) return null;
    return state.tileTrees[tileId] ?? null;
  }, [tileId, state.tileTrees]);
}

export function useUndoRedo() {
  const dispatch = useEditorDispatch();
  const state = useEditorState();
  return {
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
  };
}
