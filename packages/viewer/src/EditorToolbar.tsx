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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-panel border border-edge rounded-md p-1 shadow-lg">
      {TOOLS.map((t) => {
        const active = tool === t.tool;
        const Icon = t.Icon;
        return (
          <button
            key={t.tool}
            onClick={() => onSetTool(t.tool)}
            title={`${t.label} (${t.key})`}
            className={[
              "w-8 h-8 grid place-items-center rounded cursor-pointer transition-colors",
              active
                ? "bg-accent-soft text-accent ring-1 ring-accent"
                : "text-fg-dim hover:bg-panel-2 hover:text-fg",
            ].join(" ")}
          >
            <Icon size={16} strokeWidth={2} />
          </button>
        );
      })}
      <span className="w-px h-5 bg-edge mx-1" />
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        className="w-8 h-8 grid place-items-center rounded cursor-pointer text-fg-dim hover:bg-panel-2 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <Undo2 size={16} strokeWidth={2} />
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        className="w-8 h-8 grid place-items-center rounded cursor-pointer text-fg-dim hover:bg-panel-2 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <Redo2 size={16} strokeWidth={2} />
      </button>
      <span className="w-px h-5 bg-edge mx-1" />
      <SaveBadge status={saveStatus} />
    </div>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  let icon: LucideIcon | null = null;
  let text = "";
  let cls = "text-fg-faint";
  switch (status.kind) {
    case "idle":
      break;
    case "saving":
      icon = Loader2;
      text = "Saving";
      cls = "text-fg-dim";
      break;
    case "saved":
      icon = Check;
      text = "Saved";
      cls = "text-ok";
      break;
    case "error":
      icon = AlertTriangle;
      text = "Save failed";
      cls = "text-danger";
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
