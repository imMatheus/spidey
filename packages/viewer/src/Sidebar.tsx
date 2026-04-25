import type { SpideyDocument, SpideyPage } from "@spidey/shared";

type Props = {
  doc: SpideyDocument;
  pages: SpideyPage[];
  search: string;
  onSearch: (s: string) => void;
  focusId: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function Sidebar({
  doc,
  pages,
  search,
  onSearch,
  focusId,
  activeId,
  onSelect,
}: Props) {
  const errCount = doc.pages.filter((p) => p.status === "error").length;
  return (
    <aside className="col-start-1 row-start-1 row-span-2 bg-panel border-r border-edge flex flex-col min-h-0">
      <div className="p-3 border-b border-edge">
        <h1 className="m-0 mb-2 text-sm font-semibold tracking-wide">
          🕷 Spidey
        </h1>
        <input
          type="search"
          placeholder="Filter routes…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full bg-panel-2 text-fg border border-edge rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {pages.length === 0 && (
          <div className="px-3 py-2 text-fg-dim text-xs">
            No matching routes.
          </div>
        )}
        {pages.map((p) => {
          const isFocus = focusId === p.id;
          const isActive = activeId === p.id;
          return (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              title={p.url}
              className={[
                "px-3 py-2 cursor-pointer text-xs flex items-center gap-2 border-l-2",
                "hover:bg-panel-2",
                isFocus
                  ? "bg-panel-2 border-l-accent"
                  : "border-l-transparent",
              ].join(" ")}
            >
              <span
                className={[
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  p.status === "error" ? "bg-danger" : "bg-ok",
                ].join(" ")}
              />
              <span
                className={[
                  "flex-1 whitespace-nowrap overflow-hidden text-ellipsis",
                  isActive ? "text-accent font-medium" : "",
                ].join(" ")}
              >
                {p.route}
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-3 py-2 border-t border-edge text-[11px] text-fg-dim">
        {doc.pages.length} routes
        {errCount > 0 ? ` · ${errCount} error${errCount === 1 ? "" : "s"}` : ""}
      </div>
    </aside>
  );
}
