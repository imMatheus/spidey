import type { AgentKind } from '../protocol'
import { AGENT_KINDS, DEFAULT_AGENT } from '../protocol'

const STORAGE_KEY = 'spidey-grab.agent'

export interface AgentInfo {
  kind: AgentKind
  label: string
}

const LABELS: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

export function agentLabel(kind: AgentKind): string {
  return LABELS[kind]
}

function read(): AgentKind {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && (AGENT_KINDS as string[]).includes(raw)) return raw as AgentKind
  } catch {
    // ignore
  }
  return DEFAULT_AGENT
}

type Listener = (kind: AgentKind) => void

class AgentSelection {
  private current: AgentKind = read()
  private listeners = new Set<Listener>()

  get(): AgentKind {
    return this.current
  }

  label(): string {
    return LABELS[this.current]
  }

  set(kind: AgentKind) {
    if (this.current === kind) return
    this.current = kind
    try {
      localStorage.setItem(STORAGE_KEY, kind)
    } catch {
      // ignore
    }
    for (const l of this.listeners) {
      try {
        l(kind)
      } catch {
        // ignore
      }
    }
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const agentSelection = new AgentSelection()
