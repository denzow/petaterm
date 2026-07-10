import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView } from './components/TerminalView'
import { GitPanel } from './components/GitPanel'
import { Settings } from './components/Settings'
import { useTabsStore } from './stores/tabs'
import { ShortcutAction, useKeybindingsStore } from './stores/keybindings'

export default function App(): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const [gitPanelOpen, setGitPanelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [gitInfo, setGitInfo] = useState<{ isRepo: boolean; branch: string }>({
    isRepo: false,
    branch: ''
  })

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const activeCwd = activeTab?.cwd ?? ''

  // Keep the latest isRepo readable from the once-registered key handler.
  const isRepoRef = useRef(false)
  isRepoRef.current = gitInfo.isRepo

  // Detect whether the active tab's cwd is a git repo (and which branch), so
  // the right-edge Git handle only appears under a repository. Re-checked when
  // the cwd changes and whenever the panel closes (to pick up branch changes).
  useEffect(() => {
    let cancelled = false
    if (!activeCwd) {
      setGitInfo({ isRepo: false, branch: '' })
      return
    }
    void window.petaterm.gitOverview(activeCwd).then((ov) => {
      if (cancelled) return
      setGitInfo({ isRepo: ov.isRepo, branch: ov.currentBranch })
    })
    return () => {
      cancelled = true
    }
  }, [activeCwd, gitPanelOpen])

  // Never leave the panel open once the active tab is no longer a repo.
  useEffect(() => {
    if (!gitInfo.isRepo) setGitPanelOpen(false)
  }, [gitInfo.isRepo])

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

  // App-wide keyboard shortcuts, dispatched from the (customizable) keybindings
  // store. Mirrored inside xterm's key handler so the shell doesn't swallow them.
  useEffect(() => {
    const runAction = (action: ShortcutAction): void => {
      const store = useTabsStore.getState()
      switch (action) {
        case 'newTab':
          store.addTab()
          break
        case 'closeTab':
          if (store.activeTabId) {
            window.petaterm.ptyDispose(store.activeTabId)
            store.removeTab(store.activeTabId)
          }
          break
        case 'toggleGitPanel':
          // The Git panel only exists under a repository.
          if (isRepoRef.current) setGitPanelOpen((open) => !open)
          break
        case 'prevTab':
          store.activateRelative(-1)
          break
        case 'nextTab':
          store.activateRelative(1)
          break
      }
    }
    const handler = (e: KeyboardEvent): void => {
      const kb = useKeybindingsStore.getState()
      if (kb.capturing) return // don't fire actions while rebinding in settings
      const action = kb.actionFor(e)
      if (!action) return
      e.preventDefault()
      runAction(action)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="app">
      <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="main">
        <div className="terminals">
          {tabs.map((tab) => (
            <TerminalView key={tab.id} tab={tab} active={tab.id === activeTabId} />
          ))}
        </div>
        {gitInfo.isRepo && !gitPanelOpen && (
          <button
            className="git-handle"
            onClick={() => setGitPanelOpen(true)}
            title="Git パネルを開く (Ctrl+Shift+G)"
          >
            <span className="git-handle-icon">⎇</span>
            <span className="git-handle-text">{gitInfo.branch || 'Git'}</span>
          </button>
        )}
        {gitPanelOpen && activeTab && (
          <GitPanel tab={activeTab} onClose={() => setGitPanelOpen(false)} />
        )}
      </div>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
