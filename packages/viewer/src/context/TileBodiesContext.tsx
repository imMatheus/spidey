import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { findElementById } from "../editor/render";
import { useEditorRev } from "./EditorContext";

/** Each Tile registers the synthesized <body> inside its shadow root here.
 *  The registry lets Inspector/Toolbar/Overlay resolve a node id to a live
 *  HTMLElement without prop-drilling refs. The bodies live in a ref (not
 *  state) so registration doesn't trigger a render — `version` is bumped
 *  instead so consumer hooks can refetch. */
type Registry = {
  bodies: Map<string, HTMLElement>;
  version: number;
};

type ContextValue = {
  registry: Registry;
  /** Atomic version increments — consumers depend on this to know when to
   *  refetch from the bodies map. */
  bump: () => void;
  /** Latest version (also returned via subscription). */
  version: number;
};

const TileBodiesContext = createContext<ContextValue | null>(null);

export function TileBodiesProvider({ children }: { children: ReactNode }) {
  const registryRef = useRef<Registry>({ bodies: new Map(), version: 0 });
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => {
    registryRef.current.version += 1;
    setVersion(registryRef.current.version);
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ registry: registryRef.current, bump, version }),
    [bump, version],
  );

  return (
    <TileBodiesContext.Provider value={value}>
      {children}
    </TileBodiesContext.Provider>
  );
}

function useTileBodiesContext(): ContextValue {
  const v = useContext(TileBodiesContext);
  if (!v)
    throw new Error("TileBodies hook used outside TileBodiesProvider");
  return v;
}

/** Stable callback Tile uses on each shell-mount to register its synth
 *  <body>. Internally a ref-bump so registering doesn't re-render unrelated
 *  consumers. */
export function useRegisterTileBody() {
  const { registry, bump } = useTileBodiesContext();
  return useCallback(
    (tileId: string, body: HTMLElement) => {
      registry.bodies.set(tileId, body);
      bump();
    },
    [registry, bump],
  );
}

/** Live <body> element for a given tile, or null if not yet registered. */
export function useTileBody(tileId: string | null): HTMLElement | null {
  const { registry, version } = useTileBodiesContext();
  return useMemo(() => {
    if (!tileId) return null;
    return registry.bodies.get(tileId) ?? null;
    // version intentionally a dep — registration bumps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileId, version]);
}

/** Resolve `nodeId` → live HTMLElement inside the given tile.
 *
 *  Lookup runs in an effect (not a memo): a memo runs during render, before
 *  Tile's tree-mount effect has rebuilt the DOM after a tree mutation, and
 *  would hand back stale/detached refs. Effects fire child-first, so by the
 *  time this one runs Tile's mount effect has already updated the DOM.
 *
 *  Re-resolves whenever the tile body, the node id, or the editor revision
 *  changes. */
export function useElementForNode(
  tileId: string | null,
  nodeId: string | null,
): HTMLElement | null {
  const body = useTileBody(tileId);
  const rev = useEditorRev();
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(body && nodeId ? findElementById(body, nodeId) : null);
  }, [body, nodeId, rev]);
  return el;
}
