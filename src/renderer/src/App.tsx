import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView } from './components/TerminalView'
import { GitPanel } from './components/GitPanel'
import { useTabsStore } from './stores/tabs'

export default function App(): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const [gitPanelOpen, setGitPanelOpen] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // Global IPC listeners (registered once).
  useEffect(() => {
    const store = useTabsStore.getState()
    const unsubCwd = window.petaterm.onTabCwd(({ tabId, cwd }) => {
      useTabsStore.getState().setCwd(tabId, cwd)
    })
    const unsubActivity = window.petaterm.onTabActivity(({ tabId, state, message }) => {
      useTabsStore.getState().setActivity(tabId, state, message)
    })
    const unsubExit = window.petaterm.onPtyExit(({ tabId }) => {
      useTabsStore.getState().removeTab(tabId)
    })
    if (store.tabs.length === 0) store.addTab()
    return () => {
      unsubCwd()
      unsubActivity()
      unsubExit()
    }
  }, [])

  // App-wide keyboard shortcuts (also mirrored inside xterm's key handler).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (!e.ctrlKey || !e.shiftKey) return
      const store = useTabsStore.getState()
      if (e.key === 'T') {
        e.preventDefault()
        store.addTab()
      } else if (e.key === 'W') {
        e.preventDefault()
        if (store.activeTabId) {
          window.petaterm.ptyDispose(store.activeTabId)
          store.removeTab(store.activeTabId)
        }
      } else if (e.key === 'G') {
        e.preventDefault()
        setGitPanelOpen((open) => !open)
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        store.activateRelative(-1)
      } else if (e.key === 'PageDown') {
        e.preventDefault()
        store.activateRelative(1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app">
      <Sidebar gitPanelOpen={gitPanelOpen} onToggleGitPanel={() => setGitPanelOpen((o) => !o)} />
      <div className="main">
        <div className="terminals">
          {tabs.map((tab) => (
            <TerminalView key={tab.id} tab={tab} active={tab.id === activeTabId} />
          ))}
        </div>
        {gitPanelOpen && activeTab && (
          <GitPanel tab={activeTab} onClose={() => setGitPanelOpen(false)} />
        )}
      </div>
    </div>
  )
}
