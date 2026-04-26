import { Bug } from "lucide-react";
import type { SpideyDocument, SpideyPage } from "@spidey/shared";

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
}: Props) {
  const allTiles = doc.tiles ?? doc.pages ?? [];
  const errCount = allTiles.filter((p) => p.status === "error").length;
  const routes = pages.filter((p) => (p.kind ?? "route") === "route");
  const components = pages.filter((p) => p.kind === "component");

  return (
    <aside className="col-start-1 row-start-1 row-span-2 bg-panel border-r border-edge flex flex-col min-h-0">
      <div className="p-3 border-b border-edge">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h1 className="m-0 text-sm font-semibold tracking-wide whitespace-nowrap inline-flex items-center gap-1.5">
            <Bug size={14} strokeWidth={2} className="text-accent" />
            Spidey
          </h1>
          {projects.length > 1 && (
            <select
              value={activeProjectId ?? ""}
              onChange={(e) => onSwitchProject(e.target.value)}
              className="bg-panel-2 text-fg border border-edge rounded px-1.5 py-1 text-[11px] cursor-pointer focus:outline-none focus:border-accent min-w-0 max-w-[150px]"
              title="Switch project"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-panel-2 text-fg border border-edge rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
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
      <div className="px-3 py-2 border-t border-edge text-[11px] text-fg-dim">
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
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.6px] text-fg-faint flex items-center justify-between">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1.5 text-fg-dim text-xs">{children}</div>;
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
        "hover:bg-panel-2",
        focus ? "bg-panel-2 border-l-accent" : "border-l-transparent",
      ].join(" ")}
    >
      <span
        className={[
          "w-1.5 h-1.5 rounded-full shrink-0",
          page.status === "error" ? "bg-danger" : "bg-ok",
        ].join(" ")}
      />
      <span
        className={[
          "flex-1 whitespace-nowrap overflow-hidden text-ellipsis",
          active && !isComponent ? "text-accent font-medium" : "",
          isComponent ? "font-mono text-accent" : "",
        ].join(" ")}
      >
        {isComponent ? `<${display}>` : display}
      </span>
    </div>
  );
}
