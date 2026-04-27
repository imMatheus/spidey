import { useState } from 'react'
import type { SpideyPage } from '@spidey/shared'
import { LayersPanel } from './LayersPanel'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ThemeToggle } from '@/components/theme-toggle'
import spideyLogo from './assets/spidey-logo.png'
import { useProject, useSelection, useSelectionActions } from './context'

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

  const allTiles = doc?.tiles ?? doc?.pages ?? []
  const errCount = allTiles.filter((p) => p.status === 'error').length
  const filteredTiles = filterPages(allTiles, search)
  const routes = filteredTiles.filter((p) => (p.kind ?? 'route') === 'route')
  const components = filteredTiles.filter((p) => p.kind === 'component')

  const showLayers = activeTileId != null
  const activeProject = projects.find((p) => p.id === activeProjectId)

  const onSelect = (id: string) => {
    setFocusId(id)
    setActiveTileId(id)
  }

  return (
    <aside className="col-start-1 row-start-1 row-span-2 bg-card border-r border-border flex flex-col min-h-0">
      <div className="px-4 pt-3 pb-3 border-b border-border space-y-3">
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
          <ThemeToggle />
        </div>
        {projects.length > 1 ? (
          <div className="-mx-1">
            <NativeSelect
              size="sm"
              className="w-full text-[13px] font-medium border-transparent bg-transparent shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted px-2"
              value={activeProjectId ?? ''}
              onChange={(e) => setActiveProjectId(e.target.value)}
              title="Switch project"
            >
              {projects.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ) : activeProject ? (
          <div className="text-[13px] font-medium px-1">
            {activeProject.name}
          </div>
        ) : null}
        <Input
          type="search"
          placeholder="Filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-2">
        <Section title="Routes" count={routes.length}>
          {routes.length === 0 && <Empty>No matching routes.</Empty>}
          {routes.map((p) => (
            <Row
              key={p.id}
              page={p}
              focus={focusId === p.id}
              active={activeTileId === p.id}
              onSelect={() => onSelect(p.id)}
            />
          ))}
        </Section>
        {components.length > 0 || (doc?.components?.length ?? 0) > 0 ? (
          <Section title="Components" count={components.length}>
            {components.length === 0 && <Empty>No matching components.</Empty>}
            {components.map((p) => (
              <Row
                key={p.id}
                page={p}
                focus={focusId === p.id}
                active={activeTileId === p.id}
                onSelect={() => onSelect(p.id)}
              />
            ))}
          </Section>
        ) : null}
      </div>
      {showLayers && activeTileId && (
        <div
          // key=activeTileId forces internal row state (open/closed, drop
          // targets) to reset when the active tile changes.
          key={activeTileId}
          className="flex flex-col min-h-0 flex-1 border-t border-border"
        >
          <LayersPanel tileId={activeTileId} />
        </div>
      )}
      <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground shrink-0">
        {allTiles.length} tiles
        {errCount > 0 ? ` · ${errCount} error${errCount === 1 ? '' : 's'}` : ''}
      </div>
    </aside>
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
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="mb-2">
      <div className="px-4 pt-2 pb-1 text-[12px] font-semibold flex items-center justify-between text-foreground">
        <span>{title}</span>
        <span className="text-muted-foreground/70 font-normal text-[11px]">
          {count}
        </span>
      </div>
      {children}
    </div>
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

  return (
    <div
      onClick={onSelect}
      title={isComponent ? page.component?.file : page.url}
      className={[
        'px-4 py-1.5 cursor-pointer text-[13px] flex items-center gap-2',
        focus ? 'bg-muted' : 'hover:bg-muted/60',
      ].join(' ')}
    >
      {page.status === 'error' && (
        <span
          aria-label="Error"
          className="w-1.5 h-1.5 rounded-full shrink-0 bg-destructive"
        />
      )}
      <span
        className={[
          'flex-1 whitespace-nowrap overflow-hidden text-ellipsis',
          active ? 'font-medium' : '',
          isComponent ? 'font-mono text-[12px]' : '',
        ].join(' ')}
      >
        {isComponent ? `<${display}>` : display}
      </span>
    </div>
  )
}
