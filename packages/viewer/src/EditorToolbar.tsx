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

type Props = {
  tool: Tool;
  onSetTool: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
  { tool: "rect", key: "R", Icon: Square, label: "Rectangle" },
  { tool: "image", key: "I", Icon: ImageIcon, label: "Image" },
];

export function EditorToolbar({
  tool,
  onSetTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  saveStatus,
}: Props) {
  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-md p-1 shadow-lg">
      <ToggleGroup
        type="single"
        size="sm"
        value={tool}
        onValueChange={(v) => v && onSetTool(v as Tool)}
      >
        {TOOLS.map((t) => {
          const Icon = t.Icon;
          return (
            <Tooltip key={t.tool}>
              <TooltipTrigger asChild>
                <ToggleGroupItem value={t.tool} aria-label={t.label}>
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
            onClick={onUndo}
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
            onClick={onRedo}
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
      className={`px-2 text-[11px] font-mono whitespace-nowrap inline-flex items-center gap-1 ${cls}`}
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
