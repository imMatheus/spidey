import { useEffect, useState } from 'react'
import { ChevronDown, Component, FileText } from 'lucide-react'
import type { SpideyPage } from '@spidey/shared'
import { LayersPanel } from './LayersPanel'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'
import spideyLogo from './assets/spidey-logo.png'
import { useProject, useSelection, useSelectionActions } from './context'

type SectionKey = 'routes' | 'components' | 'layers'
type CollapseState = Record<SectionKey, boolean>

const COLLAPSE_KEY = 'spidey-sidebar-sections'

function loadCollapse(): CollapseState {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CollapseState>
      return {
        routes: Boolean(parsed.routes),
        components: Boolean(parsed.components),
        layers: Boolean(parsed.layers),
      }
    }
  } catch {
    /* ignore */
  }
  return { routes: false, components: false, layers: false }
}

export function Sidebar() {
  const {
    doc,
    projects,
    activeProjectId,
    setActiveProjectId,
    focusId,
    setFocusId,
  } = useProject()
  const { activeTileId } = useSelection()
  const { setActiveTileId } = useSelectionActions()

  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<CollapseState>(loadCollapse)

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed))
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const toggle = (key: SectionKey) =>
    setCollapsed((s) => ({ ...s, [key]: !s[key] }))

  const allTiles = doc?.tiles ?? doc?.pages ?? []
  const errCount = allTiles.filter((p) => p.status === 'error').length
  const filteredTiles = filterPages(allTiles, search)
  const routes = filteredTiles.filter((p) => (p.kind ?? 'route') === 'route')
  const components = filteredTiles.filter((p) => p.kind === 'component')

  const showLayers = activeTileId != null
  const showComponents =
    components.length > 0 || (doc?.components?.length ?? 0) > 0

  const onSelect = (id: string) => {
    setFocusId(id)
    setActiveTileId(id)
  }

  return (
    <ShadcnSidebar
      side="left"
      variant="floating"
      collapsible="offcanvas"
      className="[--sidebar:var(--color-background)] dark:[--sidebar:var(--color-surface)]"
    >
      <SidebarHeader className="px-4 pt-3 pb-3 border-b border-sidebar-border space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 text-[13px] font-semibold inline-flex items-center gap-1.5">
            <div className="bg-white py-0.5 px-px rounded-xs">
              <img
                src={spideyLogo}
                alt=""
                className="size-5 object-contain shrink-0"
              />
            </div>
            Spidey
          </h1>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <SidebarTrigger title="Collapse sidebar" />
          </div>
        </div>
        {projects.length > 0 ? (
          <div className="-mx-1">
            <NativeSelect
              size="sm"
              className="w-full text-[13px] font-medium border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted px-2"
              value={activeProjectId ?? ''}
              onChange={(e) => setActiveProjectId(e.target.value)}
              title={projects.length > 1 ? 'Switch project' : undefined}
            >
              {projects.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <Input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </SidebarHeader>
      <SidebarContent className="!overflow-hidden gap-0">
        <Section
          title="Routes"
          count={routes.length}
          collapsed={collapsed.routes}
          onToggle={() => toggle('routes')}
        >
          {routes.length === 0 ? (
            <Empty>No matching routes.</Empty>
          ) : (
            routes.map((p) => (
              <Row
                key={p.id}
                page={p}
                focus={focusId === p.id}
                active={activeTileId === p.id}
                onSelect={() => onSelect(p.id)}
              />
            ))
          )}
        </Section>
        {showComponents && (
          <Section
            title="Components"
            count={components.length}
            collapsed={collapsed.components}
            onToggle={() => toggle('components')}
          >
            {components.length === 0 ? (
              <Empty>No matching components.</Empty>
            ) : (
              components.map((p) => (
                <Row
                  key={p.id}
                  page={p}
                  focus={focusId === p.id}
                  active={activeTileId === p.id}
                  onSelect={() => onSelect(p.id)}
                />
              ))
            )}
          </Section>
        )}
        {showLayers && activeTileId && (
          <Section
            title="Layers"
            collapsed={collapsed.layers}
            onToggle={() => toggle('layers')}
            // LayersPanel manages its own scroll (breadcrumb pinned, tree
            // scrolls), so don't wrap it in another overflow-y-auto.
            bodyClassName="flex flex-col"
          >
            <div
              // key=activeTileId resets internal row state (open/closed,
              // drop targets) when the active tile changes.
              key={activeTileId}
              className="flex-1 min-h-0 flex flex-col"
            >
              <LayersPanel tileId={activeTileId} />
            </div>
          </Section>
        )}
      </SidebarContent>
      <SidebarFooter className="px-4 py-2 border-t border-sidebar-border text-[11px] text-muted-foreground shrink-0">
        {allTiles.length} tiles
        {errCount > 0 ? ` · ${errCount} error${errCount === 1 ? '' : 's'}` : ''}
      </SidebarFooter>
    </ShadcnSidebar>
  )
}

function filterPages(pages: SpideyPage[], search: string): SpideyPage[] {
  const q = search.trim().toLowerCase()
  if (!q) return pages
  return pages.filter((p) => {
    const haystacks = [
      p.route,
      p.title,
      p.component?.name,
      p.component?.file,
    ].filter((s): s is string => typeof s === 'string')
    return haystacks.some((s) => s.toLowerCase().includes(q))
  })
}

function Section({
  title,
  count,
  collapsed,
  onToggle,
  children,
  bodyClassName,
}: {
  title: string
  count?: number
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
  /** Override the default scrolling body wrapper. Pass `flex flex-col` for
   *  children that manage their own scroll (e.g. LayersPanel). */
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col min-w-0 border-b border-sidebar-border last:border-b-0',
        // flex-1 + max-h-max — section gets an equal share of the
        // sidebar height, but caps at its content size. So a tiny Routes
        // (2 items) sits at content height with no wasted whitespace, and
        // a long Components hits the same share-ceiling as Routes would,
        // scrolling internally instead of dominating. min-h-0 lets the
        // body shrink past content; collapsed sections are header-only.
        collapsed ? 'shrink-0' : 'flex-1 max-h-max min-h-0',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 h-7 px-3 flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <ChevronDown
          size={11}
          strokeWidth={2.5}
          className={cn(
            'shrink-0 transition-transform duration-150',
            collapsed && '-rotate-90',
          )}
        />
        <span className="flex-1 text-left">{title}</span>
        {count != null && (
          <span className="font-mono font-normal text-[10px] tabular-nums opacity-70">
            {count}
          </span>
        )}
      </button>
      {!collapsed && (
        <div
          className={cn(
            'flex-1 min-h-0',
            bodyClassName ?? 'overflow-y-auto py-1',
          )}
        >
          {children}
        </div>
      )}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-1 text-muted-foreground text-[12px]">
      {children}
    </div>
  )
}

function Row({
  page,
  focus,
  active,
  onSelect,
}: {
  page: SpideyPage
  focus: boolean
  active: boolean
  onSelect: () => void
}) {
  const isComponent = page.kind === 'component'
  const display = isComponent
    ? (page.component?.name ?? page.id)
    : (page.route ?? page.url ?? page.id)
  const Icon = isComponent ? Component : FileText

  return (
    <div
      onClick={onSelect}
      title={isComponent ? page.component?.file : page.url}
      className={[
        'mx-2 rounded-md px-2 py-1.5 cursor-pointer text-[13px] flex items-center gap-2',
        focus ? 'bg-muted' : 'hover:bg-muted/60',
      ].join(' ')}
    >
      {page.status === 'error' && (
        <span
          aria-label="Error"
          className="w-1.5 h-1.5 rounded-full shrink-0 bg-destructive"
        />
      )}
      <Icon size={14} className="shrink-0 text-muted-foreground" />
      <span
        className={[
          'flex-1 whitespace-nowrap overflow-hidden text-ellipsis',
          active ? 'font-medium' : '',
          isComponent ? 'font-mono text-[12px]' : '',
        ].join(' ')}
      >
        {display}
      </span>
    </div>
  )
}
