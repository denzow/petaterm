import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TerminalView } from './components/TerminalView'
import { FilesPanel } from './components/FilesPanel'
import { GitDiffPanel } from './components/GitDiffPanel'
import { GitLogPanel } from './components/GitLogPanel'
import { Settings } from './components/Settings'
import { useTabsStore } from './stores/tabs'
import { ShortcutAction, useKeybindingsStore } from './stores/keybindings'
import { loadSession, saveSession } from './stores/session'

type MainPanel = 'terminal' | 'files' | 'diff' | 'log'

/** Main-area panels in left-to-right order for Ctrl+←/→ switching; the Git
    panels only exist when the active tab's cwd is a repository. */
function panelOrder(isRepo: boolean): MainPanel[] {
  return isRepo ? ['terminal', 'files', 'diff', 'log'] : ['terminal', 'files']
}

export default function App(): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const [panel, setPanel] = useState<MainPanel>('terminal')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [gitInfo, setGitInfo] = useState<{ isRepo: boolean; branch: string }>({
    isRepo: false,
    branch: ''
  })

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const activeCwd = activeTab?.cwd ?? ''

  // Keep the latest isRepo / panel readable from the once-registered key handler.
  const isRepoRef = useRef(false)
  isRepoRef.current = gitInfo.isRepo
  const panelRef = useRef<MainPanel>('terminal')
  panelRef.current = panel

  // Detect whether the active tab's cwd is a git repo (and which branch), so
  // the Git panels only appear under a repository. Re-checked when the cwd
  // changes and whenever the panel switches (to pick up branch changes).
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
  }, [activeCwd, panel])

  // Never leave a Git panel open once the active tab is no longer a repo.
  useEffect(() => {
    if (!gitInfo.isRepo) setPanel((p) => (p === 'diff' || p === 'log' ? 'terminal' : p))
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

    // Restore the previous session's tabs (their directories) on first launch,
    // otherwise start with a single tab.
    if (store.tabs.length === 0) {
      const saved = loadSession()
      if (saved && saved.tabs.length > 0) store.restoreTabs(saved.tabs, saved.activeIndex)
      else store.addTab()
    }

    // Persist the open tabs' directories on every change so the latest state is
    // always saved by the time the app quits.
    const unsubPersist = useTabsStore.subscribe((state) => {
      saveSession({
        tabs: state.tabs.map((t) => ({ cwd: t.cwd, title: t.title })),
        activeIndex: Math.max(
          0,
          state.tabs.findIndex((t) => t.id === state.activeTabId)
        )
      })
    })

    return () => {
      unsubCwd()
      unsubActivity()
      unsubExit()
      unsubPersist()
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
        case 'panelLeft':
        case 'panelRight': {
          const order = panelOrder(isRepoRef.current)
          const index = order.indexOf(panelRef.current)
          const next = index + (action === 'panelLeft' ? -1 : 1)
          if (next >= 0 && next < order.length) setPanel(order[next])
          break
        }
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
      // copy/paste are handled inside the focused TerminalView (they need the
      // xterm instance); elsewhere the native clipboard behavior should win.
      if (action === 'copy' || action === 'paste') return
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
        {/* A top bar switches the main area between the terminal, the files
            panel, and (when the cwd is a git repo) the two Git panels. */}
        <div className="view-tabs">
          <button
            className={`view-tab${panel === 'terminal' ? ' active' : ''}`}
            onClick={() => setPanel('terminal')}
            title="terminal パネル (Ctrl+←)"
          >
            terminal
          </button>
          <button
            className={`view-tab${panel === 'files' ? ' active' : ''}`}
            onClick={() => setPanel('files')}
            title="files パネル (Ctrl+←/→)"
          >
            files
          </button>
          {gitInfo.isRepo && (
            <>
              <button
                className={`view-tab${panel === 'diff' ? ' active' : ''}`}
                onClick={() => setPanel('diff')}
                title="diff パネル (Ctrl+←/→)"
              >
                diff
              </button>
              <button
                className={`view-tab${panel === 'log' ? ' active' : ''}`}
                onClick={() => setPanel('log')}
                title="log パネル (Ctrl+→)"
              >
                log
              </button>
              <span className="view-tabs-branch" title="現在のブランチ">
                <span className="view-tab-icon">⎇</span>
                {gitInfo.branch}
              </span>
            </>
          )}
        </div>
        <div className="view-content">
          {/* Terminals stay mounted (ptys alive) but are hidden while another
              panel takes over the area. */}
          <div className="terminals" style={{ display: panel === 'terminal' ? 'block' : 'none' }}>
            {tabs.map((tab) => (
              <TerminalView
                key={tab.id}
                tab={tab}
                active={tab.id === activeTabId && panel === 'terminal'}
              />
            ))}
          </div>
          {panel === 'files' && activeTab && <FilesPanel tab={activeTab} />}
          {panel === 'diff' && activeTab && <GitDiffPanel tab={activeTab} />}
          {panel === 'log' && activeTab && <GitLogPanel tab={activeTab} />}
        </div>
      </div>
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
