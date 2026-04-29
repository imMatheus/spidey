import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Toolbar } from "./Toolbar";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { EditorToolbar } from "./EditorToolbar";
import { HandoffBar } from "./HandoffBar";
import { CommandPalette } from "./CommandPalette";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  EditorProvider,
  ProjectProvider,
  SelectionProvider,
  TileBodiesProvider,
  useProject,
} from "./context";
import { useEditorKeyboard } from "./hooks/useEditorKeyboard";
import { useAutoSave } from "./hooks/useAutoSave";

/**
 * App is now the provider stack + a thin Workspace component. State and
 * cross-cutting wiring (keyboard shortcuts, autosave, doc loading) live in
 * dedicated providers/hooks; pages communicate via context, not props.
 *
 * Provider order is meaningful:
 *   Tooltip
 *     Editor                — reducer + dispatch
 *       Selection           — UI selection (independent of editor reducer)
 *         Project           — needs editor dispatch + selection.clearAll
 *           TileBodies      — needs editor.rev (via useElementForNode)
 */
export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <EditorProvider>
        <SelectionProvider>
          <ProjectProvider>
            <TileBodiesProvider>
              <Workspace />
            </TileBodiesProvider>
          </ProjectProvider>
        </SelectionProvider>
      </EditorProvider>
    </TooltipProvider>
  );
}

function Workspace() {
  const { status } = useProject();
  // Hooks needed across the whole workspace: keyboard shortcuts and the
  // debounced PUT-on-dirty autosave.
  useEditorKeyboard();
  const saveStatus = useAutoSave();

  // Canvas reports its current zoom up here so the top Toolbar can show
  // the percentage. Local UI state — no need for context.
  const [scale, setScale] = useState(1);

  if (status.kind === "loading") {
    return (
      <div className="absolute inset-0 grid place-items-center text-center text-muted-foreground">
        <div>
          <div className="text-lg mb-1.5 text-foreground">Loading…</div>
          <div>Fetching spidey.json</div>
        </div>
      </div>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="absolute inset-0 grid place-items-center text-center text-muted-foreground">
        <div>
          <div className="text-lg mb-1.5 text-foreground">
            Could not load spidey.json
          </div>
          <div>{status.message}</div>
        </div>
      </div>
    );
  }

  // Only the LEFT sidebar lives inside the SidebarProvider — the
  // toolbar's SidebarTrigger toggles only that one. The Inspector
  // (right) renders as a sibling custom panel so it stays put.
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "16rem" } as React.CSSProperties}
      className="h-full bg-background text-foreground"
    >
      <Sidebar />
      <SidebarInset className="flex min-w-0 flex-col overflow-hidden bg-transparent">
        <ToolbarRow scale={scale} />
        <div className="flex-1 min-h-0 relative">
          <Canvas onScaleChange={setScale} />
        </div>
      </SidebarInset>
      <Inspector />
      <CollapsedSidebarTrigger />
      <CommandPalette />
      {/* Bottom-center floating panel: gesture-handoff bar above the editor
          toolbar, wrapped in a tinted frame so the section reads as one
          unit and stands out against the canvas. */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 p-2 bg-muted/70 border border-border rounded-xl backdrop-blur-md shadow-2xl">
        <HandoffBar />
        <EditorToolbar saveStatus={saveStatus} />
      </div>
    </SidebarProvider>
  );
}

/**
 * Floating reopen-button that materializes when the sidebar is
 * collapsed. The in-sidebar trigger (next to the theme toggle) is
 * unreachable once the sidebar slides off-canvas, so we surface this
 * twin at the top-left corner of the viewport — the same visual
 * neighborhood the user just clicked from. Hidden when the sidebar is
 * expanded so the two triggers don't fight for the same space.
 */
function CollapsedSidebarTrigger() {
  const { state } = useSidebar();
  if (state !== "collapsed") return null;
  return (
    <SidebarTrigger
      title="Open left sidebar"
      className="fixed top-3 left-3 z-50 bg-sidebar text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border [--sidebar:var(--color-background)] dark:[--sidebar:var(--color-surface)]"
    />
  );
}

/**
 * Toolbar wrapper — when the sidebar is collapsed, the floating
 * reopen-trigger sits at top-left of the viewport (top-3 left-3, ~28px
 * wide). Without an offset, the toolbar's left edge slides under it.
 * Bumping `pl-12` clears the trigger's footprint so the button stays
 * tappable and the toolbar's first item starts past it. Padding
 * transitions to keep the shift smooth as the sidebar animates.
 */
function ToolbarRow({ scale }: { scale: number }) {
  const { state } = useSidebar();
  return (
    <div
      className={cn(
        "p-2 shrink-0 transition-[padding] duration-100 ease-out",
        state === "collapsed" && "pl-12",
      )}
    >
      <Toolbar scale={scale} />
    </div>
  );
}
