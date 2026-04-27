import {
  MousePointer2,
  Hand,
  Type,
  Square,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Loader2,
  Check,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { Tool } from "./editor/state";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEditorDispatch, useEditorState, useUndoRedo } from "./context";

type Props = {
  saveStatus: SaveStatus;
};

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const TOOLS: { tool: Tool; key: string; Icon: LucideIcon; label: string }[] = [
  { tool: "select", key: "V", Icon: MousePointer2, label: "Select" },
  { tool: "hand", key: "H", Icon: Hand, label: "Pan canvas" },
  { tool: "text", key: "T", Icon: Type, label: "Text" },
  { tool: "rect", key: "B", Icon: Square, label: "Box" },
  { tool: "image", key: "I", Icon: ImageIcon, label: "Image" },
];

export function EditorToolbar({ saveStatus }: Props) {
  const dispatch = useEditorDispatch();
  const tool = useEditorState().tool;
  const { canUndo, canRedo, undo, redo } = useUndoRedo();
  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-md p-1 shadow-lg">
      <ToggleGroup
        type="single"
        size="sm"
        value={tool}
        onValueChange={(v) => v && dispatch({ type: "setTool", tool: v as Tool })}
      >
        {TOOLS.map((t) => {
          const Icon = t.Icon;
          const active = t.tool === tool;
          return (
            <Tooltip key={t.tool}>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value={t.tool}
                  aria-label={t.label}
                  className={cn(
                    // Override the shadcn base's data-[state=on]:bg-muted via
                    // tailwind-merge: same variant prefix, last value wins.
                    "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
                    active &&
                      "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                  )}
                >
                  <Icon size={16} strokeWidth={2} />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent>
                {t.label} ({t.key})
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ToggleGroup>
      <Separator orientation="vertical" className="!h-5 mx-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={undo}
            disabled={!canUndo}
          >
            <Undo2 size={16} strokeWidth={2} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (⌘Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={redo}
            disabled={!canRedo}
          >
            <Redo2 size={16} strokeWidth={2} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="!h-5 mx-1" />
      <SaveBadge status={saveStatus} />
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  let icon: LucideIcon | null = null;
  let text = "";
  let cls = "text-muted-foreground/70";
  switch (status.kind) {
    case "idle":
      break;
    case "saving":
      icon = Loader2;
      text = "Saving";
      cls = "text-muted-foreground";
      break;
    case "saved":
      icon = Check;
      text = "Saved";
      cls = "text-emerald-500";
      break;
    case "error":
      icon = AlertTriangle;
      text = "Save failed";
      cls = "text-destructive";
      break;
  }
  if (!icon) return <span className="w-16" />;
  const Icon = icon;
  return (
    <span
      className={`px-2 text-[12px] whitespace-nowrap inline-flex items-center gap-1 ${cls}`}
      title={status.kind === "error" ? status.message : undefined}
    >
      <Icon
        size={12}
        strokeWidth={2}
        className={status.kind === "saving" ? "animate-spin" : ""}
      />
      {text}
    </span>
  );
}
