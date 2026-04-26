import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpideyDocument } from "@spidey/shared";
import { Sidebar } from "./Sidebar";
import { Toolbar, type ViewportPreset, VIEWPORTS } from "./Toolbar";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import type { TreeNode } from "./inspect/buildTree";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: SpideyDocument };

type ProjectsManifest = { id: string; name: string }[];

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [projects, setProjects] = useState<ProjectsManifest>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Inspect state
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  const [altPressed, setAltPressed] = useState(false);
  const [scale, setScale] = useState(1);
  const [activeTileBody, setActiveTileBody] = useState<HTMLElement | null>(null);
  const treesRef = useRef<Map<string, TreeNode[]>>(new Map());
  const tileBodiesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [treesVersion, setTreesVersion] = useState(0);

  // First, fetch the manifest of available projects. Falls back to a
  // single-project mode (the legacy /spidey.json endpoint) when the
  // manifest endpoint isn't present (e.g. an older view server).
  useEffect(() => {
    fetch("/spidey-projects.json")
      .then((r) =>
        r.ok ? (r.json() as Promise<ProjectsManifest>) : Promise.resolve([]),
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

  // Whenever the active project changes, re-fetch its document.
  useEffect(() => {
    setState({ status: "loading" });
    setFocusId(null);
    setActiveTileId(null);
    setSelectedElement(null);
    const url =
      activeProjectId != null
        ? `/spidey-projects/${activeProjectId}.json`
        : "/spidey.json";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`spidey.json HTTP ${r.status}`);
        return r.json();
      })
      .then((doc: SpideyDocument) => {
        treesRef.current.clear();
        tileBodiesRef.current.clear();
        setActiveTileBody(null);
        setState({ status: "ready", doc });
      })
      .catch((e) =>
        setState({ status: "error", message: String(e?.message ?? e) }),
      );
  }, [activeProjectId]);

  // Centralized selection reset — call this whenever the user's selection
  // context becomes invalid (different tile, different viewport, Esc, etc).
  const resetSelection = useCallback(() => {
    setSelectedElement(null);
    setHoveredElement(null);
  }, []);

  // Keyboard: Alt for distance overlays, Esc to "walk up" the selection
  // (selected element → active tile → nothing).
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltPressed(true);
      if (e.key === "Escape") {
        if (selectedElement) {
          setSelectedElement(null);
          setHoveredElement(null);
        } else if (activeTileId) {
          setActiveTileId(null);
        }
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
  }, [selectedElement, activeTileId]);

  // Reset selection when the active tile or the viewport changes.
  useEffect(() => {
    resetSelection();
  }, [activeTileId, viewport, resetSelection]);

  // Active tile body is owned by the tile that registers it via onTreeReady;
  // App just reflects whichever body matches activeTileId.
  useEffect(() => {
    if (activeTileId == null) {
      setActiveTileBody(null);
      return;
    }
    setActiveTileBody(tileBodiesRef.current.get(activeTileId) ?? null);
  }, [activeTileId, treesVersion]);

  const filteredPages = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.doc.pages;
    return state.doc.pages.filter((p) => {
      const haystacks = [
        p.route,
        p.title,
        p.component?.name,
        p.component?.file,
      ].filter((s): s is string => typeof s === "string");
      return haystacks.some((s) => s.toLowerCase().includes(q));
    });
  }, [state, search]);

  const handleActivateTile = useCallback((id: string | null) => {
    setActiveTileId(id);
  }, []);

  const handleSelectElement = useCallback(
    (el: HTMLElement | null, _body: HTMLElement | null) => {
      // body is registered via onTreeReady and resolved in the activeTileId
      // effect — no need to write it here.
      setSelectedElement(el);
    },
    [],
  );

  const handleHoverElement = useCallback((el: HTMLElement | null) => {
    setHoveredElement(el);
  }, []);

  const handleTreeReady = useCallback(
    (id: string, trees: TreeNode[], body: HTMLElement) => {
      treesRef.current.set(id, trees);
      tileBodiesRef.current.set(id, body);
      setTreesVersion((v) => v + 1);
    },
    [],
  );

  const handleSelectFromInspector = useCallback((el: HTMLElement) => {
    setSelectedElement(el);
  }, []);

  if (state.status === "loading") {
    return (
      <div className="absolute inset-0 grid place-items-center text-center text-fg-dim">
        <div>
          <div className="text-lg mb-1.5 text-fg">Loading…</div>
          <div>Fetching spidey.json</div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="absolute inset-0 grid place-items-center text-center text-fg-dim">
        <div>
          <div className="text-lg mb-1.5 text-fg">Could not load spidey.json</div>
          <div>{state.message}</div>
        </div>
      </div>
    );
  }

  const { doc } = state;
  const dims = VIEWPORTS[viewport];
  const activeTrees =
    activeTileId != null ? treesRef.current.get(activeTileId) ?? null : null;
  const activeTile =
    activeTileId != null
      ? (doc.pages.find((p) => p.id === activeTileId) ?? null)
      : null;
  const componentInfo =
    activeTile?.kind === "component" ? (activeTile.component ?? null) : null;

  return (
    <div className="grid grid-cols-[260px_1fr_340px] grid-rows-[44px_1fr] h-full">
      <Sidebar
        doc={doc}
        pages={filteredPages}
        search={search}
        onSearch={setSearch}
        focusId={focusId}
        activeId={activeTileId}
        projects={projects}
        activeProjectId={activeProjectId}
        onSwitchProject={setActiveProjectId}
        onSelect={(id) => {
          setFocusId(id);
          setActiveTileId(id);
        }}
      />
      <Toolbar
        doc={doc}
        viewport={viewport}
        onViewport={setViewport}
        focusId={focusId}
        onFocus={setFocusId}
        selectedElement={selectedElement}
        scale={scale}
      />
      <Canvas
        pages={doc.pages}
        viewport={dims}
        focusId={focusId}
        onClearFocus={() => setFocusId(null)}
        activeTileId={activeTileId}
        selectedElement={selectedElement}
        hoveredElement={hoveredElement}
        altPressed={altPressed}
        onActivateTile={handleActivateTile}
        onSelectElement={handleSelectElement}
        onHoverElement={handleHoverElement}
        onTreeReady={handleTreeReady}
        onScaleChange={setScale}
      />
      <Inspector
        tileId={activeTileId}
        componentInfo={componentInfo}
        trees={activeTrees}
        selected={selectedElement}
        tileBody={activeTileBody}
        scale={scale}
        onSelect={handleSelectFromInspector}
        recomputeKey={treesVersion}
      />
    </div>
  );
}
