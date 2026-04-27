import { useElementForNode, useSelection } from "../context";

/** Live HTMLElement for the current node selection within the active tile.
 *  Convenience wrapper around `useElementForNode` that reads selection
 *  state from context — useful for Toolbar/Inspector/etc that don't need
 *  to wire tile/node ids manually. */
export function useSelectedElement(): HTMLElement | null {
  const { activeTileId, selectedNodeId } = useSelection();
  return useElementForNode(activeTileId, selectedNodeId);
}
