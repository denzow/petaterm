import { create } from 'zustand'
import { TabActivityState } from '../../../shared/ipc'

export interface Tab {
  id: string
  /** User-assigned name; falls back to the cwd basename when null. */
  title: string | null
  cwd: string
  /**
   * Claude Code session status shown as the tab's icon. Persistent: it tracks
   * hook events only (null = no session) and is never cleared by focusing or
   * typing into the tab.
   */
  activity: TabActivityState | null
  activityMessage: string
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
  /** Whether the active tab's cwd is a git repo (i.e. the Git panel exists). */
  activeRepo: boolean
  setActiveRepo: (value: boolean) => void
  addTab: () => void
  restoreTabs: (saved: { cwd: string; title: string | null }[], activeIndex: number) => void
  removeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  activateRelative: (offset: number) => void
  renameTab: (tabId: string, title: string | null) => void
  setCwd: (tabId: string, cwd: string) => void
  setActivity: (tabId: string, activity: TabActivityState | null, message: string) => void
}

let tabCounter = 0

export function tabLabel(tab: Tab): string {
  if (tab.title) return tab.title
  if (tab.cwd) return tab.cwd.split('/').filter(Boolean).pop() ?? '/'
  return 'terminal'
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  activeRepo: false,

  setActiveRepo: (value) => set((s) => (s.activeRepo === value ? s : { activeRepo: value })),

  addTab: () => {
    const id = `tab-${Date.now().toString(36)}-${++tabCounter}`
    set((s) => {
      const activeIndex = s.tabs.findIndex((t) => t.id === s.activeTabId)
      // New tabs inherit the cwd of the tab they're spawned from.
      const inheritedCwd = activeIndex === -1 ? '' : s.tabs[activeIndex].cwd
      const tab: Tab = { id, title: null, cwd: inheritedCwd, activity: null, activityMessage: '' }
      const tabs = [...s.tabs]
      // Insert right after the active tab (or at the end if there is none).
      tabs.splice(activeIndex === -1 ? tabs.length : activeIndex + 1, 0, tab)
      return { tabs, activeTabId: id }
    })
  },

  restoreTabs: (saved, activeIndex) => {
    const tabs: Tab[] = saved.map((st) => ({
      id: `tab-${Date.now().toString(36)}-${++tabCounter}`,
      title: st.title,
      cwd: st.cwd,
      activity: null,
      activityMessage: ''
    }))
    const active = tabs[activeIndex] ?? tabs[0] ?? null
    set({ tabs, activeTabId: active?.id ?? null })
  },

  removeTab: (tabId) => {
    set((s) => {
      const index = s.tabs.findIndex((t) => t.id === tabId)
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      let activeTabId = s.activeTabId
      if (activeTabId === tabId) {
        const neighbor = tabs[Math.min(index, tabs.length - 1)]
        activeTabId = neighbor?.id ?? null
      }
      return { tabs, activeTabId }
    })
    if (get().tabs.length === 0) get().addTab()
  },

  activateTab: (tabId) => {
    set((s) => (s.tabs.some((t) => t.id === tabId) ? { activeTabId: tabId } : s))
  },

  activateRelative: (offset) => {
    const { tabs, activeTabId, activateTab } = get()
    if (tabs.length === 0) return
    const index = tabs.findIndex((t) => t.id === activeTabId)
    const next = tabs[(index + offset + tabs.length) % tabs.length]
    activateTab(next.id)
  },

  renameTab: (tabId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t))
    }))
  },

  setCwd: (tabId, cwd) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, cwd } : t))
    }))
  },

  setActivity: (tabId, activity, message) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      // PreToolUse fires per tool call — skip the no-op updates.
      if (!tab || (tab.activity === activity && tab.activityMessage === message)) return s
      return {
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, activity, activityMessage: message } : t
        )
      }
    })
  }
}))
