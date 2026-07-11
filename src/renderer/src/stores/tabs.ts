import { create } from 'zustand'
import { TabActivityState } from '../../../shared/ipc'

export interface Tab {
  id: string
  /** User-assigned name; falls back to the cwd basename when null. */
  title: string | null
  cwd: string
  activity: TabActivityState | null
  activityMessage: string
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
  addTab: () => void
  restoreTabs: (saved: { cwd: string; title: string | null }[], activeIndex: number) => void
  removeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  activateRelative: (offset: number) => void
  renameTab: (tabId: string, title: string | null) => void
  setCwd: (tabId: string, cwd: string) => void
  setActivity: (tabId: string, activity: TabActivityState, message: string) => void
  clearActivity: (tabId: string) => void
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
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab) return s
      // Switching to a tab acknowledges its badge.
      return {
        activeTabId: tabId,
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, activity: null, activityMessage: '' } : t
        )
      }
    })
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
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId ? { ...t, activity, activityMessage: message } : t
      )
    }))
  },

  clearActivity: (tabId) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      if (!tab || tab.activity === null) return s
      return {
        tabs: s.tabs.map((t) =>
          t.id === tabId ? { ...t, activity: null, activityMessage: '' } : t
        )
      }
    })
  }
}))
