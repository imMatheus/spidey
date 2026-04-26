import type { SpideyDocument } from "@spidey/shared";

export type ViewportPreset = "desktop" | "tablet" | "mobile";

export const VIEWPORTS: Record<ViewportPreset, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

type Props = {
  doc: SpideyDocument;
  viewport: ViewportPreset;
  onViewport: (v: ViewportPreset) => void;
  focusId: string | null;
  onFocus: (id: string | null) => void;
  selectedElement: HTMLElement | null;
  scale: number;
};

const labelCls =
  "text-fg-dim text-[11px] uppercase tracking-[0.5px]";
const dividerCls = "w-px h-6 bg-edge mx-1";
const metaCls = "text-fg-dim text-[11px]";

export function Toolbar({
  doc,
  viewport,
  onViewport,
  selectedElement,
  scale,
}: Props) {
  const sel = selectedElement ? describe(selectedElement) : null;

  return (
    <div className="col-start-2 row-start-1 flex items-center gap-2 px-3 bg-panel border-b border-edge text-xs">
      <span className={labelCls}>Viewport</span>
      <div className="flex gap-1 items-center">
        {(Object.keys(VIEWPORTS) as ViewportPreset[]).map((key) => {
          const isActive = viewport === key;
          return (
            <button
              key={key}
              onClick={() => onViewport(key)}
              className={[
                "px-2.5 py-1.5 rounded border text-xs cursor-pointer",
                isActive
                  ? "bg-accent border-accent text-white"
                  : "bg-panel-2 text-fg border-edge hover:bg-[#353535]",
              ].join(" ")}
            >
              {key}
            </button>
          );
        })}
      </div>
      <div className={dividerCls} />
      <span className={metaCls}>
        {doc.project.name} · {doc.project.framework} · {(doc.tiles ?? doc.pages ?? []).length} tiles
      </span>
      <div className="flex-1" />
      <span className="font-mono text-[11px] text-fg">
        {sel ?? <span className="text-fg-dim">no selection</span>}
      </span>
      <div className={dividerCls} />
      <span className={metaCls}>{Math.round(scale * 100)}%</span>
    </div>
  );
}

function describe(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const cls = el.classList[0];
  const r = el.getBoundingClientRect();
  const w = Math.round(r.width);
  const h = Math.round(r.height);
  const id = el.id ? `#${el.id}` : "";
  const c = cls ? `.${cls}` : "";
  return `${tag}${id}${c} · ${w}×${h}`;
}
