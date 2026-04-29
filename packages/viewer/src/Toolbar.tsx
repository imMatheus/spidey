import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { useProject, VIEWPORTS, type ViewportPreset } from './context'
import { useSelectedElement } from './hooks/useSelectedElement'

type Props = {
  scale: number
}

const metaCls = 'text-muted-foreground text-[12px]'

export function Toolbar({ scale }: Props) {
  const { viewport, setViewport } = useProject()
  const selectedElement = useSelectedElement()
  const sel = selectedElement ? describe(selectedElement) : null

  return (
    <div className="h-11 shrink-0 flex items-center gap-2 px-3 text-xs bg-sidebar text-sidebar-foreground rounded-lg shadow-sm ring-1 ring-sidebar-border [--sidebar:var(--color-background)] dark:[--sidebar:var(--color-surface)]">
      <span className={metaCls}>Viewport</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={viewport}
        onValueChange={(v) => v && setViewport(v as ViewportPreset)}
      >
        {(Object.keys(VIEWPORTS) as ViewportPreset[]).map((key) => (
          <ToggleGroupItem key={key} value={key} aria-label={key}>
            {key}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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

export { VIEWPORTS, type ViewportPreset }
