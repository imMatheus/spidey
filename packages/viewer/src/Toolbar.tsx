import type { SpideyDocument } from '@spidey/shared'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'

export type ViewportPreset = 'desktop' | 'tablet' | 'mobile'

export const VIEWPORTS: Record<
  ViewportPreset,
  { width: number; height: number }
> = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
}

type Props = {
  doc: SpideyDocument
  viewport: ViewportPreset
  onViewport: (v: ViewportPreset) => void
  focusId: string | null
  onFocus: (id: string | null) => void
  selectedElement: HTMLElement | null
  scale: number
}

const labelCls = 'text-muted-foreground text-[11px] uppercase tracking-[0.5px]'
const metaCls = 'text-muted-foreground text-[11px]'

export function Toolbar({
  doc,
  viewport,
  onViewport,
  selectedElement,
  scale,
}: Props) {
  const sel = selectedElement ? describe(selectedElement) : null

  return (
    <div className="col-start-2 row-start-1 flex items-center gap-2 px-3 bg-card border-b border-border text-xs">
      <span className={labelCls}>Viewport</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={viewport}
        onValueChange={(v) => v && onViewport(v as ViewportPreset)}
      >
        {(Object.keys(VIEWPORTS) as ViewportPreset[]).map((key) => (
          <ToggleGroupItem key={key} value={key} aria-label={key}>
            {key}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Separator orientation="vertical" className="!h-6 mx-1" />
      <span className={metaCls}>
        {doc.project.name} · {doc.project.framework} ·{' '}
        {(doc.tiles ?? doc.pages ?? []).length} tiles
      </span>
      <div className="flex-1" />
      <span className="font-mono text-[11px] text-foreground">
        {sel ?? <span className="text-muted-foreground">no selection</span>}
      </span>
      <Separator orientation="vertical" className="!h-6 mx-1" />
      <span className={metaCls}>{Math.round(scale * 100)}%</span>
    </div>
  )
}

function describe(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const cls = el.classList[0]
  const r = el.getBoundingClientRect()
  const w = Math.round(r.width)
  const h = Math.round(r.height)
  const id = el.id ? `#${el.id}` : ''
  const c = cls ? `.${cls}` : ''
  return `${tag}${id}${c} · ${w}×${h}`
}
