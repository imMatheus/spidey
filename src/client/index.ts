// bippy must be evaluated before React; importing it here installs the RDT hook
// as a side-effect. This IIFE bundle runs synchronously when the <script> tag
// loads, so as long as the user pastes the tag into <head> before their app
// entry, the hook is in place when React boots.
import 'bippy'

import { mountShadow } from './mount'
import { TriggerButton } from './trigger'
import type { MenuItem } from './trigger'
import { OverlayLayer } from './overlay'
import { Picker } from './pick'
import { PromptBox } from './prompt-box'
import { StatusManager } from './status'
import { JobSocket } from './socket'
import { resolveTarget } from './source'
import { buildFingerprint, findByFingerprint } from './refind'
import { persistence } from './persistence'
import { DiffSidebar, loadPersistedSidebar, timeChipHTML } from './diff-sidebar'
import { agentSelection, agentLabel } from './agent'
import type {
  AgentKind,
  CreateJobRequest,
  CreateJobResponse,
  JobHistoryListResponse,
  JobHistorySummary,
  ServerEvent,
} from '../protocol'
import { AGENT_KINDS } from '../protocol'

declare global {
  interface Window {
    __SPIDEY_GRAB__?: boolean
  }
}

function boot() {
  if (window.__SPIDEY_GRAB__) return
  window.__SPIDEY_GRAB__ = true

  const baseUrl = detectBaseUrl()
  const mount = mountShadow()
  const overlay = new OverlayLayer(mount.layer)
  const socket = new JobSocket(baseUrl)
  const diffSidebar = new DiffSidebar({ parent: mount.layer, baseUrl, socket })
  const status = new StatusManager(overlay, {
    onBadgeClick: (jobId) => {
      const pending = pendingJobs.get(jobId)
      // Running jobs have no history bundle yet — hand the sidebar the
      // prompt we tracked locally so it can render the pending turn.
      void diffSidebar.show(
        jobId,
        pending
          ? { pending: { jobId, prompt: pending.prompt, agent: pending.agent } }
          : {},
      )
    },
  })

  // cached history list — invalidated when the daemon emits a job event that
  // would change it (new job, or any status transition that promotes a job
  // out of `running`). avoids re-fetching on every menu open.
  let cachedHistory: JobHistorySummary[] | null = null

  // jobs we've POSTed locally that haven't yet appeared in the daemon's
  // /jobs/history (which only writes on completion). these get rendered at
  // the top of the history menu with a spinner while running.
  interface PendingJob {
    prompt: string
    createdAt: number
    agent: AgentKind
  }
  const pendingJobs = new Map<string, PendingJob>()
  let historyMenuOpen = false
  let agentMenuOpen = false

  socket.on((event) => {
    if (event.type === 'hello') {
      recoverFromHello(event)
    }
    if (event.type === 'job:status' && event.status !== 'running') {
      // job has landed in the daemon's history; drop our local placeholder,
      // invalidate the cached list, and re-render so the menu shows the real
      // entry with its time chip.
      const wasPending = pendingJobs.delete(event.jobId)
      cachedHistory = null
      if (wasPending && historyMenuOpen) {
        void refreshHistoryMenu()
      }
    }
    status.handleServerEvent(event)
  })

  let mode: 'idle' | 'picking' = 'idle'
  let activePromptBox: PromptBox | null = null
  let selectedOutlineId: symbol | null = null

  const isOwnNode = (node: Node | null): boolean => {
    if (!node) return false
    return mount.host.contains(node) || node === mount.host
  }

  function clearSelected() {
    if (selectedOutlineId !== null) {
      overlay.remove(selectedOutlineId)
      selectedOutlineId = null
    }
  }

  function closePromptBox() {
    activePromptBox?.destroy()
    activePromptBox = null
    clearSelected()
  }

  function mainMenuItems(): MenuItem[] {
    return [
      {
        label: mode === 'picking' ? 'Stop picking' : 'Pick element',
        kbd: '⌘G',
        onClick: toggleGrab,
      },
      {
        label: 'History',
        kbd: '⌘⇧H',
        keepOpen: true,
        onClick: () => void openHistorySubmenu(),
      },
      {
        label: 'Agent',
        kbd: agentLabel(agentSelection.get()),
        keepOpen: true,
        onClick: () => openAgentSubmenu(),
      },
    ]
  }

  function buildAgentItems(): MenuItem[] {
    const current = agentSelection.get()
    const items: MenuItem[] = [
      {
        label: '← Back',
        keepOpen: true,
        onClick: () => {
          agentMenuOpen = false
          trigger.setMenuItems(mainMenuItems())
        },
      },
    ]
    for (const kind of AGENT_KINDS) {
      items.push({
        label: agentLabel(kind),
        kbd: kind === current ? '✓' : '',
        onClick: () => {
          agentSelection.set(kind)
          agentMenuOpen = false
        },
      })
    }
    return items
  }

  function openAgentSubmenu() {
    agentMenuOpen = true
    historyMenuOpen = false
    trigger.setMenuItems(buildAgentItems())
  }

  const trigger = new TriggerButton({
    parent: mount.layer,
    getMenuItems: mainMenuItems,
    onCloseMenu: () => {
      historyMenuOpen = false
      agentMenuOpen = false
    },
  })

  agentSelection.onChange(() => {
    if (agentMenuOpen) {
      trigger.setMenuItems(buildAgentItems())
    } else if (trigger.isOpen() && !historyMenuOpen) {
      // refresh the main menu so the kbd label updates
      trigger.setMenuItems(mainMenuItems())
    }
  })

  const updateCounter = () => {
    const c = status.counts()
    trigger.setCounts(c.running, c.done, c.failed)
  }
  status.onChange(updateCounter)
  updateCounter()

  // Restore the diff sidebar if it was open before a reload
  // (Vite/HMR sometimes does a full refresh after Claude's edit lands).
  const persistedSidebar = loadPersistedSidebar()
  if (persistedSidebar) {
    void diffSidebar.show(persistedSidebar.rootJobId, {
      pending: persistedSidebar.pending,
    })
  }

  function buildHistoryItems(entries: JobHistorySummary[]): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: '← Back',
        keepOpen: true,
        onClick: () => {
          historyMenuOpen = false
          trigger.setMenuItems(mainMenuItems())
        },
      },
    ]

    const pendingList = Array.from(pendingJobs.entries())
      .map(([jobId, p]) => ({ jobId, ...p }))
      .sort((a, b) => b.createdAt - a.createdAt)

    for (const p of pendingList) {
      const preview = p.prompt.length > 80 ? p.prompt.slice(0, 79) + '…' : p.prompt
      items.push({
        label: preview || '(empty prompt)',
        kbd: '<div class="spinner"></div>',
        compact: true,
        onClick: () => {
          void diffSidebar.show(p.jobId, {
            pending: { jobId: p.jobId, prompt: p.prompt },
          })
        },
      })
    }

    const remaining = Math.max(0, 6 - pendingList.length)
    const completed = entries
      .filter((e) => !pendingJobs.has(e.jobId))
      .slice(0, remaining)
    for (const entry of completed) {
      items.push({
        label: entry.promptPreview || '(empty prompt)',
        kbd: timeChipHTML(entry.createdAt),
        variant: entry.status === 'failed' ? 'danger' : 'default',
        compact: true,
        onClick: () => {
          void diffSidebar.show(entry.jobId)
        },
      })
    }

    if (items.length === 1) {
      items.push({ label: 'no history yet', disabled: true, onClick: () => {} })
    }

    return items
  }

  async function ensureHistoryFetched() {
    if (cachedHistory !== null) return
    try {
      const res = await fetch(`${baseUrl}jobs/history`)
      if (res.ok) {
        const body = (await res.json()) as JobHistoryListResponse
        cachedHistory = body.entries
      }
    } catch {
      // ignore — show empty
    }
  }

  async function refreshHistoryMenu() {
    if (!historyMenuOpen || !trigger.isOpen()) return
    await ensureHistoryFetched()
    if (!historyMenuOpen || !trigger.isOpen()) return
    trigger.setMenuItems(buildHistoryItems(cachedHistory ?? []))
  }

  async function openHistorySubmenu() {
    const wasOpen = trigger.isOpen()
    historyMenuOpen = true

    // if the menu is already open we morph through a loading state so the user
    // sees something happen immediately. when opening directly from closed
    // (e.g. ⌘⇧H), we skip the loading state and just wait for the fetch so
    // the menu pops in already showing the history entries. when the cache is
    // warm we skip the loading state entirely.
    if (wasOpen && cachedHistory === null && pendingJobs.size === 0) {
      const loadingItems: MenuItem[] = [
        {
          label: '← Back',
          keepOpen: true,
          onClick: () => {
            historyMenuOpen = false
            trigger.setMenuItems(mainMenuItems())
          },
        },
        { label: 'Loading…', disabled: true, onClick: () => {} },
      ]
      trigger.setMenuItems(loadingItems)
    }

    await ensureHistoryFetched()
    if (!historyMenuOpen) return

    const items = buildHistoryItems(cachedHistory ?? [])
    if (trigger.isOpen()) {
      trigger.setMenuItems(items)
    } else {
      trigger.open(items)
    }
  }

  function trackPendingJob(jobId: string, prompt: string, agent: AgentKind) {
    pendingJobs.set(jobId, { prompt, createdAt: Date.now(), agent })
    if (historyMenuOpen) void refreshHistoryMenu()
  }

  function toggleGrab() {
    if (mode === 'picking') {
      stopPicking()
    } else {
      closePromptBox()
      startPicking()
    }
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return

      // ⌘G / Ctrl+G — toggle grab
      if (!e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault()
        e.stopPropagation()
        toggleGrab()
        return
      }

      // ⌘⇧H / Ctrl+⇧+H — open history menu directly
      if (e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault()
        e.stopPropagation()
        void openHistorySubmenu()
        return
      }
    },
    true,
  )

  const picker = new Picker(overlay, {
    isOwnNode,
    onPick: async (target, clickX, clickY) => {
      stopPicking()
      await openPromptFor(target, clickX, clickY)
    },
    onCancel: () => {
      stopPicking()
    },
  })

  function startPicking() {
    closePromptBox()
    mode = 'picking'
    trigger.setActive(true)
    picker.start()
  }

  function stopPicking() {
    if (mode !== 'picking') return
    mode = 'idle'
    trigger.setActive(false)
    picker.stop()
  }

  async function openPromptFor(
    target: Element,
    clickX?: number,
    clickY?: number,
  ) {
    closePromptBox()
    const resolved = await resolveTarget(target)
    const initialFp = buildFingerprint(target, resolved)
    let currentFp = initialFp

    selectedOutlineId = overlay.attach(target, 'selected', {
      withBadge: false,
      refinder: () => findByFingerprint(currentFp),
    })

    activePromptBox = new PromptBox({
      parent: mount.layer,
      target,
      resolved,
      clickX,
      clickY,
      onSubmit: async (prompt, submittedTarget, submittedResolved) => {
        const box = activePromptBox
        activePromptBox = null
        box?.destroy()
        clearSelected()

        const fp = buildFingerprint(submittedTarget, submittedResolved)
        const submittedAgent = agentSelection.get()
        const req: CreateJobRequest = {
          prompt,
          source: submittedResolved.source,
          context: submittedResolved.context,
          agent: submittedAgent,
        }

        try {
          const res = await fetch(`${baseUrl}jobs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(req),
          })
          if (!res.ok) {
            console.error(
              '[spidey-grab] failed to create job',
              res.status,
              await res.text(),
            )
            return
          }
          const body = (await res.json()) as CreateJobResponse
          status.track(body.jobId, submittedTarget, fp, { persist: true })
          trackPendingJob(body.jobId, prompt, submittedAgent)
        } catch (err) {
          console.error('[spidey-grab] could not reach daemon', err)
        }
      },
      onCancel: () => {
        closePromptBox()
      },
      onNavigate: async (current, direction) => {
        const next =
          direction === 'up'
            ? navigateUp(current)
            : direction === 'down'
              ? navigateDown(current)
              : direction === 'left'
                ? navigatePrevSibling(current)
                : navigateNextSibling(current)
        if (!next) return null
        const nextResolved = await resolveTarget(next)
        const nextFp = buildFingerprint(next, nextResolved)
        if (selectedOutlineId !== null) {
          overlay.setAnimatingPosition(selectedOutlineId, true)
          overlay.retarget(selectedOutlineId, next)
          overlay.updateRefinder(selectedOutlineId, () =>
            findByFingerprint(nextFp),
          )
          // clear the animating-position class after the transition window so
          // future scroll/resize positioning doesn't lag through the transition.
          window.setTimeout(() => {
            if (selectedOutlineId !== null) {
              overlay.setAnimatingPosition(selectedOutlineId, false)
            }
          }, 320)
        }
        currentFp = nextFp
        return { target: next, resolved: nextResolved }
      },
    })
  }

  function navigateUp(target: Element): Element | null {
    let parent = target.parentElement
    while (parent && isOwnNode(parent)) parent = parent.parentElement
    if (!parent) return null
    if (parent === document.documentElement) return null
    return parent
  }

  function navigateDown(target: Element): Element | null {
    let child: Element | null = target.firstElementChild
    while (child && isOwnNode(child)) child = child.nextElementSibling
    return child
  }

  function navigatePrevSibling(target: Element): Element | null {
    let sib: Element | null = target.previousElementSibling
    while (sib && isOwnNode(sib)) sib = sib.previousElementSibling
    return sib
  }

  function navigateNextSibling(target: Element): Element | null {
    let sib: Element | null = target.nextElementSibling
    while (sib && isOwnNode(sib)) sib = sib.nextElementSibling
    return sib
  }

  function recoverFromHello(event: Extract<ServerEvent, { type: 'hello' }>) {
    // Hydrate the local pending map from the daemon's view of running jobs.
    // This lets the diff sidebar render an in-flight job (which has no
    // history file yet) using the prompt the daemon kept in memory.
    for (const j of event.jobs) {
      if (j.status === 'running' && j.prompt && !pendingJobs.has(j.jobId)) {
        pendingJobs.set(j.jobId, {
          prompt: j.prompt,
          createdAt: j.createdAt,
          // Older daemons / pre-agent jobs come back without `agent` — claude
          // is the safe default since that's the only thing those daemons run.
          agent: j.agent ?? 'claude',
        })
      }
    }

    const persisted = persistence.load()
    if (persisted.length === 0) return
    const byId = new Map(event.jobs.map((j) => [j.jobId, j]))
    for (const p of persisted) {
      const snap = byId.get(p.jobId)
      if (!snap) {
        // daemon doesn't know this job anymore (probably restarted); drop it
        persistence.remove(p.jobId)
        continue
      }
      // already attached this session? skip
      if (status.hasJob(p.jobId)) continue
      void status.recover(p, {
        status: snap.status,
        step: snap.step,
        error: snap.error,
      })
    }
  }
}

function detectBaseUrl(): string {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]')
  for (const s of Array.from(scripts).reverse()) {
    const src = s.src
    if (src && /spidey-grab(?:\.js|\/inject\.js)/.test(src)) {
      try {
        const u = new URL(src)
        return `${u.origin}/`
      } catch {
        // ignore
      }
    }
  }
  // fallback: same origin as the page (only useful if the user is serving the bundle themselves)
  return `${location.origin}/`
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true })
} else {
  boot()
}
