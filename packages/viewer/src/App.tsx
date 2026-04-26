import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { SpideyDocument, SpideyNode } from "@spidey/shared";
import { Sidebar } from "./Sidebar";
import { Toolbar, type ViewportPreset, VIEWPORTS } from "./Toolbar";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { EditorToolbar, type SaveStatus } from "./EditorToolbar";
import { reducer, makeInitialState, type Tool } from "./editor/state";
import { normalizeDoc } from "./editor/legacy";
import { findElementById } from "./editor/render";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; doc: SpideyDocument };

type ProjectsManifest = { id: string; name: string }[];

const SAVE_DEBOUNCE_MS = 500;

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [projects, setProjects] = useState<ProjectsManifest>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Editor state — reducer-owned trees, history, tool, dirty flag.
  const [editor, dispatch] = useReducer(reducer, undefined as never, () =>
    makeInitialState({}),
  );

  // Inspect state — node ids replace HTMLElement refs as the source of truth
  // so they survive tree re-mounts. The HTMLElement is derived on demand.
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [altPressed, setAltPressed] = useState(false);
  const [scale, setScale] = useState(1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  // tile-id → live <body> element. Tile registers via onBodyReady so we can
  // resolve node ids → HTMLElements without prop-drilling refs everywhere.
  const tileBodiesRef = useRef<Map<string, HTMLElement>>(new Map());
  const [bodiesVersion, setBodiesVersion] = useState(0);

  // Fetch project manifest. Falls back gracefully when the manifest endpoint
  // is missing (e.g. an older view server).
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

  // Whenever the active project changes, re-fetch its document and seed the
  // editor with its trees. Selection / focus / saved state all reset.
  useEffect(() => {
    setState({ status: "loading" });
    setFocusId(null);
    setActiveTileId(null);
    setSelectedNodeId(null);
    setHoveredNodeId(null);
    setSaveStatus({ kind: "idle" });
    const url =
      activeProjectId != null
        ? `/spidey-projects/${activeProjectId}.json`
        : "/spidey.json";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`spidey.json HTTP ${r.status}`);
        return r.json();
      })
      .then((rawDoc: SpideyDocument) => {
        const doc = normalizeDoc(rawDoc);
        const tiles = doc.tiles ?? [];
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
        tileBodiesRef.current.clear();
        dispatch({ type: "init", tileTrees, tilesMeta });
        setState({ status: "ready", doc });
      })
      .catch((e) =>
        setState({ status: "error", message: String(e?.message ?? e) }),
      );
  }, [activeProjectId]);

  const resetSelection = useCallback(() => {
    setSelectedNodeId(null);
    setHoveredNodeId(null);
  }, []);

  // Keyboard: tool shortcuts, undo/redo, Esc to walk-up selection, Alt for
  // distance overlays. Plain-letter shortcuts are blocked when focus is in
  // an input/contenteditable so they don't fight typing.
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
      // owns this history. (Browsers' native undo is per-input only.)
      const meta = e.metaKey || e.ctrlKey;
      if (meta && !e.altKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }

      // Delete selected node — only when not typing, not editing.
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
      // Cmd-D duplicate
      if (
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
      // Cmd-C / Cmd-X copy/cut
      if (meta && (e.key === "c" || e.key === "C") && activeTileId && selectedNodeId) {
        dispatch({ type: "copyNode", tileId: activeTileId, nodeId: selectedNodeId });
        return;
      }
      if (meta && (e.key === "x" || e.key === "X") && activeTileId && selectedNodeId) {
        e.preventDefault();
        dispatch({ type: "cutNode", tileId: activeTileId, nodeId: selectedNodeId });
        setSelectedNodeId(null);
        return;
      }
      // Cmd-V paste-as-child of selection (or root if no selection)
      if (meta && (e.key === "v" || e.key === "V") && activeTileId && editor.clipboard) {
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
        case "r":
        case "R":
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
  }, [selectedNodeId, activeTileId, editor.clipboard, editor.tileTrees]);

  // Reset selection when active tile or viewport changes.
  useEffect(() => {
    resetSelection();
  }, [activeTileId, viewport, resetSelection]);

  // Resolve nodeId → live HTMLElement. activeTileBody itself is cheap to
  // memoize from the ref+version (the ref is mutated in onBodyReady, which
  // bumps bodiesVersion). selected/hovered elements need to be resolved in
  // an effect, NOT a memo: a memo runs during render — before Tile's effect
  // has rebuilt the DOM after a tree mutation — so it would hand back
  // detached element refs. useEffect runs child-first, so by the time App's
  // effect fires, Tile's tree-mount effect has already updated the DOM.
  const activeTileBody = useMemo(() => {
    if (!activeTileId) return null;
    return tileBodiesRef.current.get(activeTileId) ?? null;
  }, [activeTileId, bodiesVersion]);

  const [selectedElement, setSelectedElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSelectedElement(
      activeTileBody && selectedNodeId
        ? findElementById(activeTileBody, selectedNodeId)
        : null,
    );
  }, [activeTileBody, selectedNodeId, editor.rev]);

  const handleBodyReady = useCallback((tileId: string, body: HTMLElement) => {
    tileBodiesRef.current.set(tileId, body);
    setBodiesVersion((v) => v + 1);
  }, []);

  // Filtered tiles for sidebar/canvas. Pages list comes from the loaded doc;
  // each tile's `tree` is overridden by the editor reducer's working copy.
  const docTiles = state.status === "ready" ? state.doc.tiles ?? [] : [];
  const filteredPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docTiles;
    return docTiles.filter((p) => {
      const haystacks = [
        p.route,
        p.title,
        p.component?.name,
        p.component?.file,
      ].filter((s): s is string => typeof s === "string");
      return haystacks.some((s) => s.toLowerCase().includes(q));
    });
  }, [docTiles, search]);

  // Autosave: when dirty, debounce + PUT the full doc back to the server,
  // including current tile trees + an editedAt timestamp.
  useEffect(() => {
    if (!editor.dirty) return;
    if (state.status !== "ready") return;
    if (activeProjectId == null) return;
    setSaveStatus({ kind: "saving" });
    const handle = window.setTimeout(async () => {
      const editedAt = new Date().toISOString();
      const tilesOut = (state.doc.tiles ?? []).map((t) => ({
        ...t,
        tree: editor.tileTrees[t.id] ?? t.tree ?? null,
      }));
      const body: SpideyDocument = {
        ...state.doc,
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
        setState({ status: "ready", doc: body });
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
  }, [editor.dirty, editor.tileTrees, state, activeProjectId]);

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
  const activeTile =
    activeTileId != null
      ? docTiles.find((p) => p.id === activeTileId) ?? null
      : null;
  const activeTree = activeTileId != null ? editor.tileTrees[activeTileId] ?? null : null;
  const componentInfo =
    activeTile?.kind === "component" ? activeTile.component ?? null : null;

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
        tiles={docTiles}
        tileTrees={editor.tileTrees}
        viewport={dims}
        focusId={focusId}
        onClearFocus={() => setFocusId(null)}
        activeTileId={activeTileId}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        altPressed={altPressed}
        tool={editor.tool}
        rev={editor.rev}
        onActivateTile={setActiveTileId}
        onSelectNode={setSelectedNodeId}
        onHoverNode={setHoveredNodeId}
        onBodyReady={handleBodyReady}
        onScaleChange={setScale}
        dispatch={dispatch}
      />
      <Inspector
        tileId={activeTileId}
        tree={activeTree}
        componentInfo={componentInfo}
        selectedNodeId={selectedNodeId}
        selectedElement={selectedElement}
        tileBody={activeTileBody}
        scale={scale}
        rev={editor.rev}
        onSelectNode={setSelectedNodeId}
        onHoverNode={setHoveredNodeId}
        onEditMaster={(componentName) => {
          const master = docTiles.find(
            (t) => t.kind === "component" && t.component?.name === componentName,
          );
          if (master) {
            setActiveTileId(master.id);
            setFocusId(master.id);
            setSelectedNodeId(null);
          }
        }}
        dispatch={dispatch}
      />
      <EditorToolbar
        tool={editor.tool}
        onSetTool={(tool: Tool) => dispatch({ type: "setTool", tool })}
        canUndo={editor.history.length > 0}
        canRedo={editor.future.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        saveStatus={saveStatus}
      />
    </div>
  );
}
