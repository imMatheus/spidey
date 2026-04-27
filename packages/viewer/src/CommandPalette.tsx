import { useEffect, useState } from "react";
import { FileText, Component } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useProject, useSelection, useSelectionActions } from "./context";

/** Cmd-K palette for jumping between routes and components. Mirrors the
 *  Sidebar's top section (no Layers): same data source, same grouping.
 *  The radix-nova `CommandDialog` does not wrap children in `<Command>`,
 *  so we provide that wrapper ourselves — without it cmdk's primitives
 *  can't find their context and crash on mount. */
export function CommandPalette() {
  const { doc, setFocusId } = useProject();
  const { activeTileId } = useSelection();
  const { setActiveTileId } = useSelectionActions();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  const allTiles = doc?.tiles ?? doc?.pages ?? [];
  const routes = allTiles.filter((p) => (p.kind ?? "route") === "route");
  const components = allTiles.filter((p) => p.kind === "component");

  const onSelect = (id: string) => {
    setFocusId(id);
    setActiveTileId(id);
    setOpen(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      className="sm:max-w-2xl"
    >
      <Command>
        <CommandInput placeholder="Jump to a route or component…" />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>No matches.</CommandEmpty>
          {routes.length > 0 && (
            <CommandGroup heading="Routes">
              {routes.map((p) => {
                const label = p.route ?? p.url ?? p.id;
                return (
                  <CommandItem
                    key={p.id}
                    value={`route ${label} ${p.title ?? ""} ${p.id}`}
                    onSelect={() => onSelect(p.id)}
                    data-checked={activeTileId === p.id}
                  >
                    <FileText className="text-muted-foreground" />
                    <span className="truncate">{label}</span>
                    {p.title && (
                      <span className="ml-2 text-muted-foreground truncate">
                        {p.title}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {components.length > 0 && (
            <CommandGroup heading="Components">
              {components.map((p) => {
                const name = p.component?.name ?? p.id;
                return (
                  <CommandItem
                    key={p.id}
                    value={`component ${name} ${p.component?.file ?? ""} ${p.id}`}
                    onSelect={() => onSelect(p.id)}
                    data-checked={activeTileId === p.id}
                  >
                    <Component className="text-muted-foreground" />
                    <span className="font-mono text-[12px] truncate">
                      {`<${name}>`}
                    </span>
                    {p.component?.file && (
                      <span className="ml-2 text-muted-foreground truncate text-[12px]">
                        {p.component.file}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
