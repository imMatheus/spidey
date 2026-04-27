import { Bug } from "lucide-react";
import type { SpideyDocument, SpideyNode, SpideyPage } from "@spidey/shared";
import { LayersPanel } from "./LayersPanel";
import type { EditAction } from "./editor/state";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ThemeToggle } from "@/components/theme-toggle";

type Project = { id: string; name: string };

type Props = {
  doc: SpideyDocument;
  pages: SpideyPage[];
  search: string;
  onSearch: (s: string) => void;
  focusId: string | null;
  activeId: string | null;
  projects: Project[];
  activeProjectId: string | null;
  onSwitchProject: (id: string) => void;
  onSelect: (id: string) => void;

  // ----- Layers panel inputs (active tile only) -----
  activeTree: SpideyNode | null;
  selectedNodeId: string | null;
  rev: number;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  dispatch: (action: EditAction) => void;
};

export function Sidebar({
  doc,
  pages,
  search,
  onSearch,
  focusId,
  activeId,
  projects,
  activeProjectId,
  onSwitchProject,
  onSelect,
  activeTree,
  selectedNodeId,
  rev,
  onSelectNode,
  onHoverNode,
  dispatch,
}: Props) {
  const allTiles = doc.tiles ?? doc.pages ?? [];
  const errCount = allTiles.filter((p) => p.status === "error").length;
  const routes = pages.filter((p) => (p.kind ?? "route") === "route");
  const components = pages.filter((p) => p.kind === "component");

  // Layers section appears only when a tile is active. The two flex regions
  // (tile list and layers) split the available height; without an active
  // tile the list takes all of it.
  const showLayers = activeId != null;

  return (
    <aside className="col-start-1 row-start-1 row-span-2 bg-card border-r border-border flex flex-col min-h-0">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h1 className="m-0 text-sm font-semibold tracking-wide whitespace-nowrap inline-flex items-center gap-1.5">
            <Bug size={14} strokeWidth={2} className="text-primary" />
            Spidey
          </h1>
          <div className="flex items-center gap-1 min-w-0">
            {projects.length > 1 && (
              <NativeSelect
                size="sm"
                className="max-w-[120px] text-[11px]"
                value={activeProjectId ?? ""}
                onChange={(e) => onSwitchProject(e.target.value)}
                title="Switch project"
              >
                {projects.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            <ThemeToggle />
          </div>
        </div>
        <Input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        <Section title="Routes" count={routes.length}>
          {routes.length === 0 && <Empty>No matching routes.</Empty>}
          {routes.map((p) => (
            <Row
              key={p.id}
              page={p}
              focus={focusId === p.id}
              active={activeId === p.id}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </Section>
        {components.length > 0 || (doc.components?.length ?? 0) > 0 ? (
          <Section title="Components" count={components.length}>
            {components.length === 0 && <Empty>No matching components.</Empty>}
            {components.map((p) => (
              <Row
                key={p.id}
                page={p}
                focus={focusId === p.id}
                active={activeId === p.id}
                onSelect={() => onSelect(p.id)}
              />
            ))}
          </Section>
        ) : null}
      </div>
      {showLayers && activeId && (
        <div
          // Anchored bottom region with its own flex space; key=activeId
          // forces internal row-state (open/closed, drop targets) to reset
          // when the active tile changes.
          key={activeId}
          className="flex flex-col min-h-0 flex-1 border-t border-border"
        >
          <LayersPanel
            tileId={activeId}
            tree={activeTree}
            selectedId={selectedNodeId}
            rev={rev}
            onSelect={onSelectNode}
            onHover={onHoverNode}
            dispatch={dispatch}
          />
        </div>
      )}
      <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground shrink-0">
        {allTiles.length} tiles
        {errCount > 0 ? ` · ${errCount} error${errCount === 1 ? "" : "s"}` : ""}
      </div>
    </aside>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.6px] text-muted-foreground/70 flex items-center justify-between">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1.5 text-muted-foreground text-xs">{children}</div>;
}

function Row({
  page,
  focus,
  active,
  onSelect,
}: {
  page: SpideyPage;
  focus: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const isComponent = page.kind === "component";
  const display = isComponent
    ? (page.component?.name ?? page.id)
    : (page.route ?? page.url ?? page.id);

  return (
    <div
      onClick={onSelect}
      title={isComponent ? page.component?.file : page.url}
      className={[
        "px-3 py-2 cursor-pointer text-xs flex items-center gap-2 border-l-2",
        "hover:bg-muted",
        focus ? "bg-muted border-l-primary" : "border-l-transparent",
      ].join(" ")}
    >
      <span
        className={[
          "w-1.5 h-1.5 rounded-full shrink-0",
          page.status === "error" ? "bg-destructive" : "bg-emerald-500",
        ].join(" ")}
      />
      <span
        className={[
          "flex-1 whitespace-nowrap overflow-hidden text-ellipsis",
          active && !isComponent ? "text-primary font-medium" : "",
          isComponent ? "font-mono text-primary" : "",
        ].join(" ")}
      >
        {isComponent ? `<${display}>` : display}
      </span>
    </div>
  );
}
