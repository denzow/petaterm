import { create } from 'zustand'

export type ShortcutAction = 'newTab' | 'closeTab' | 'toggleGitPanel' | 'prevTab' | 'nextTab'

export interface KeyBinding {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** Normalized key: single chars uppercased (e.g. 'T'), named keys verbatim ('PageUp'). */
  key: string
}

export const ACTION_LABELS: Record<ShortcutAction, string> = {
  newTab: '新しいセッションタブ',
  closeTab: 'セッションタブを閉じる',
  toggleGitPanel: 'terminal / Git タブ切り替え',
  prevTab: '前のセッションタブ',
  nextTab: '次のセッションタブ'
}

/** Action order as shown in the settings UI. */
export const ACTIONS: ShortcutAction[] = ['newTab', 'closeTab', 'toggleGitPanel', 'prevTab', 'nextTab']

const DEFAULT_BINDINGS: Record<ShortcutAction, KeyBinding> = {
  newTab: { ctrl: true, shift: true, alt: false, meta: false, key: 'T' },
  closeTab: { ctrl: true, shift: true, alt: false, meta: false, key: 'W' },
  toggleGitPanel: { ctrl: true, shift: true, alt: false, meta: false, key: 'G' },
  prevTab: { ctrl: true, shift: true, alt: false, meta: false, key: 'PageUp' },
  nextTab: { ctrl: true, shift: true, alt: false, meta: false, key: 'PageDown' }
}

const STORAGE_KEY = 'petaterm.keybindings'

export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toUpperCase() : key
}

export function matchBinding(e: KeyboardEvent, b: KeyBinding): boolean {
  return (
    e.ctrlKey === b.ctrl &&
    e.shiftKey === b.shift &&
    e.altKey === b.alt &&
    e.metaKey === b.meta &&
    normalizeKey(e.key) === b.key
  )
}

export function formatBinding(b: KeyBinding): string {
  const parts: string[] = []
  if (b.ctrl) parts.push('Ctrl')
  if (b.shift) parts.push('Shift')
  if (b.alt) parts.push('Alt')
  if (b.meta) parts.push('Meta')
  parts.push(b.key)
  return parts.join('+')
}

function load(): Record<ShortcutAction, KeyBinding> {
  const merged = { ...DEFAULT_BINDINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Record<ShortcutAction, KeyBinding>>
      for (const action of ACTIONS) {
        if (stored[action]) merged[action] = stored[action] as KeyBinding
      }
    }
  } catch {
    // fall back to defaults on malformed storage
  }
  return merged
}

function persist(bindings: Record<ShortcutAction, KeyBinding>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    // storage may be unavailable; keep the in-memory bindings regardless
  }
}

interface KeybindingsState {
  bindings: Record<ShortcutAction, KeyBinding>
  /** Action currently awaiting a captured key combo (settings UI), or null. */
  capturing: ShortcutAction | null
  setBinding: (action: ShortcutAction, binding: KeyBinding) => void
  resetBinding: (action: ShortcutAction) => void
  setCapturing: (action: ShortcutAction | null) => void
  /** The action bound to this event, if any. */
  actionFor: (e: KeyboardEvent) => ShortcutAction | null
}

export const useKeybindingsStore = create<KeybindingsState>((set, get) => ({
  bindings: load(),
  capturing: null,

  setBinding: (action, binding) => {
    set((s) => {
      const bindings = { ...s.bindings, [action]: binding }
      persist(bindings)
      return { bindings }
    })
  },

  resetBinding: (action) => {
    set((s) => {
      const bindings = { ...s.bindings, [action]: DEFAULT_BINDINGS[action] }
      persist(bindings)
      return { bindings }
    })
  },

  setCapturing: (action) => set({ capturing: action }),

  actionFor: (e) => {
    const { bindings } = get()
    for (const action of ACTIONS) {
      if (matchBinding(e, bindings[action])) return action
    }
    return null
  }
}))
