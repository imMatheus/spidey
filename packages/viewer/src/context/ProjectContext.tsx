import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SpideyDocument, SpideyNode } from "@spidey/shared";
import { normalizeDoc } from "../editor/legacy";
import { useEditorDispatch } from "./EditorContext";
import { useSelectionActions } from "./SelectionContext";

export type Project = { id: string; name: string };

export type ViewportPreset = "desktop" | "tablet" | "mobile";

export const VIEWPORTS: Record<
  ViewportPreset,
  { width: number; height: number }
> = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

export type ProjectStatus =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready" };

type ProjectContextValue = {
  status: ProjectStatus;
  doc: SpideyDocument | null;
  baselineMissing: boolean;
  projects: Project[];
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  /** Replace the in-memory doc (used after a successful save). */
  setDoc: (doc: SpideyDocument) => void;
  /** Update a single tile in the in-memory doc. The mutator receives
   *  the prior tile and returns the next one. Used by the recapture
   *  flow to swap a master tile's freshly-rendered tree + propsUsed
   *  without rewriting the whole doc. autosave watches editor.dirty —
   *  so callers must also dispatch a reducer action that flips dirty
   *  (e.g. replaceTileTree) for the save to fire. */
  updateTile: (
    tileId: string,
    update: (
      prev: import("@spidey/shared").SpideyTile,
    ) => import("@spidey/shared").SpideyTile,
  ) => void;
  viewport: ViewportPreset;
  setViewport: (v: ViewportPreset) => void;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

/** Loads the project manifest + active project's spidey.json + baseline
 *  sidecar, dispatches `init` to the editor, owns viewport + focus + the
 *  baseline-missing banner flag. Resets selection when the active project
 *  or viewport changes (those reset selectionn UI naturally). */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const dispatch = useEditorDispatch();
  const { clearAll, setAltPressed } = useSelectionActions();

  const [status, setStatus] = useState<ProjectStatus>({ kind: "loading" });
  const [doc, setDoc] = useState<SpideyDocument | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [baselineMissing, setBaselineMissing] = useState(false);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [focusId, setFocusId] = useState<string | null>(null);

  // Manifest fetch — falls back gracefully on older view servers.
  useEffect(() => {
    fetch("/spidey-projects.json")
      .then((r) =>
        r.ok ? (r.json() as Promise<Project[]>) : Promise.resolve([]),
      )
      .then((list) => {
        setProjects(list);
        setActiveProjectId(list[0]?.id ?? null);
      })
      .catch(() => {
        setProjects([]);
        setActiveProjectId(null);
      });
  }, []);

  // Whenever the active project changes, reload its document + baseline.
  // Selection is also cleared so we don't carry over stale ids.
  useEffect(() => {
    setStatus({ kind: "loading" });
    setFocusId(null);
    clearAll();
    setAltPressed(false);

    const url =
      activeProjectId != null
        ? `/spidey-projects/${activeProjectId}.json`
        : "/spidey.json";
    const baselineUrl =
      activeProjectId != null
        ? `/spidey-projects/${activeProjectId}/baseline.json`
        : null;

    let cancelled = false;
    Promise.all([
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`spidey.json HTTP ${r.status}`);
        return r.json();
      }),
      baselineUrl
        ? fetch(baselineUrl).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null),
    ])
      .then(
        ([rawDoc, baselineDoc]: [SpideyDocument, SpideyDocument | null]) => {
          if (cancelled) return;
          const normalized = normalizeDoc(rawDoc);
          const tiles = normalized.tiles ?? [];
          const tileTrees: Record<string, SpideyNode | null> = {};
          const tilesMeta: Record<
            string,
            { kind: "route" | "component"; componentName?: string }
          > = {};
          for (const t of tiles) {
            tileTrees[t.id] = t.tree ?? null;
            tilesMeta[t.id] = {
              kind: t.kind === "component" ? "component" : "route",
              componentName: t.component?.name,
            };
          }

          // Build baseline tile trees from the sidecar. When absent, fall
          // back to current trees (changeset starts empty until the user
          // edits) and surface the missing-baseline banner.
          let baselineTrees: Record<string, SpideyNode | null> | undefined;
          if (baselineDoc) {
            const normBaseline = normalizeDoc(baselineDoc);
            baselineTrees = {};
            for (const t of normBaseline.tiles ?? [])
              baselineTrees[t.id] = t.tree ?? null;
            // Tiles in current but not in baseline: copy current so they
            // don't surface as "removed".
            for (const id of Object.keys(tileTrees)) {
              if (!(id in baselineTrees)) baselineTrees[id] = tileTrees[id];
            }
            setBaselineMissing(false);
          } else {
            setBaselineMissing(true);
          }

          dispatch({ type: "init", tileTrees, tilesMeta, baselineTrees });
          setDoc(normalized);
          setStatus({ kind: "ready" });
        },
      )
      .catch((e) => {
        if (cancelled) return;
        setStatus({ kind: "error", message: String(e?.message ?? e) });
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, dispatch, clearAll, setAltPressed]);

  // setDoc is exposed for the autosave hook — it replaces our in-memory
  // doc with the saved version (including new editedAt) without triggering
  // another reload.
  const setDocStable = useCallback((next: SpideyDocument) => setDoc(next), []);

  const updateTile = useCallback(
    (
      tileId: string,
      update: (
        prev: import("@spidey/shared").SpideyTile,
      ) => import("@spidey/shared").SpideyTile,
    ) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const tiles = prev.tiles ?? [];
        const idx = tiles.findIndex((t) => t.id === tileId);
        if (idx < 0) return prev;
        const next = update(tiles[idx]);
        if (next === tiles[idx]) return prev;
        const nextTiles = tiles.slice();
        nextTiles[idx] = next;
        return { ...prev, tiles: nextTiles };
      });
    },
    [],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      status,
      doc,
      baselineMissing,
      projects,
      activeProjectId,
      setActiveProjectId,
      setDoc: setDocStable,
      updateTile,
      viewport,
      setViewport,
      focusId,
      setFocusId,
    }),
    [
      status,
      doc,
      baselineMissing,
      projects,
      activeProjectId,
      setDocStable,
      updateTile,
      viewport,
      focusId,
    ],
  );

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const v = useContext(ProjectContext);
  if (!v) throw new Error("useProject used outside ProjectProvider");
  return v;
}

/** Convenience: throws if doc isn't ready. Use only in subtree components
 *  rendered after the loading gate. */
export function useReadyDoc(): SpideyDocument {
  const { doc, status } = useProject();
  if (status.kind !== "ready" || !doc)
    throw new Error("useReadyDoc used before project is ready");
  return doc;
}
