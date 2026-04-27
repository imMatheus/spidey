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

  return (
    <div className="grid grid-cols-[260px_1fr_340px] grid-rows-[44px_1fr] h-full bg-background text-foreground">
      <Sidebar />
      <Toolbar scale={scale} />
      <Canvas onScaleChange={setScale} />
      <Inspector />
      <CommandPalette />
      {/* Bottom-center floating panel: gesture-handoff bar above the editor
          toolbar, wrapped in a tinted frame so the section reads as one
          unit and stands out against the canvas. */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 p-2 bg-muted/70 border border-border rounded-xl backdrop-blur-md shadow-2xl">
        <HandoffBar />
        <EditorToolbar saveStatus={saveStatus} />
      </div>
    </div>
  );
}
