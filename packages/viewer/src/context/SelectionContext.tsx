import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** UI selection — orthogonal to the editor reducer. Tracks which tile is
 *  active, which node within it is selected/hovered, and whether Alt is
 *  held (for distance-overlay measurements). */
export type SelectionState = {
  activeTileId: string | null;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  altPressed: boolean;
};

export type SelectionActions = {
  setActiveTileId: (id: string | null) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  setAltPressed: (v: boolean) => void;
  /** Clear node selection + hover (keeps the active tile). */
  clearNodeSelection: () => void;
  /** Clear everything: active tile, selection, hover. */
  clearAll: () => void;
};

const StateContext = createContext<SelectionState | null>(null);
const ActionsContext = createContext<SelectionActions | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [altPressed, setAltPressed] = useState(false);

  const clearNodeSelection = useCallback(() => {
    setSelectedNodeId(null);
    setHoveredNodeId(null);
  }, []);

  const clearAll = useCallback(() => {
    setActiveTileId(null);
    setSelectedNodeId(null);
    setHoveredNodeId(null);
  }, []);

  const state = useMemo<SelectionState>(
    () => ({ activeTileId, selectedNodeId, hoveredNodeId, altPressed }),
    [activeTileId, selectedNodeId, hoveredNodeId, altPressed],
  );

  // Actions are stable across renders so consumers that only need them
  // never re-render on selection state changes.
  const actions = useMemo<SelectionActions>(
    () => ({
      setActiveTileId,
      setSelectedNodeId,
      setHoveredNodeId,
      setAltPressed,
      clearNodeSelection,
      clearAll,
    }),
    [clearNodeSelection, clearAll],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useSelection(): SelectionState {
  const v = useContext(StateContext);
  if (!v) throw new Error("useSelection used outside SelectionProvider");
  return v;
}

export function useSelectionActions(): SelectionActions {
  const v = useContext(ActionsContext);
  if (!v)
    throw new Error("useSelectionActions used outside SelectionProvider");
  return v;
}
