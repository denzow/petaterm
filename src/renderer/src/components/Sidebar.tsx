import { useState } from 'react'
import { Tab, tabLabel, useTabsStore } from '../stores/tabs'

interface SidebarProps {
  onOpenSettings: () => void
}

export function Sidebar({ onOpenSettings }: SidebarProps): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const addTab = useTabsStore((s) => s.addTab)

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        {tabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} active={tab.id === activeTabId} />
        ))}
      </div>
      <div className="sidebar-footer">
        <button className="sidebar-button" onClick={addTab} title="新しいセッションタブ">
          ＋ 新しいセッションタブ
        </button>
        <button className="sidebar-button" onClick={onOpenSettings} title="設定">
          ⚙ 設定
        </button>
      </div>
    </div>
  )
}

function TabItem({ tab, active }: { tab: Tab; active: boolean }): React.JSX.Element {
  const activateTab = useTabsStore((s) => s.activateTab)
  const removeTab = useTabsStore((s) => s.removeTab)
  const renameTab = useTabsStore((s) => s.renameTab)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commitRename = (): void => {
    renameTab(tab.id, draft.trim() || null)
    setEditing(false)
  }

  return (
    <div
      className={`tab-item${active ? ' active' : ''}`}
      onClick={() => activateTab(tab.id)}
      onDoubleClick={() => {
        setDraft(tab.title ?? '')
        setEditing(true)
      }}
      title={tab.activityMessage || tab.cwd}
    >
      {/* Claude Code session status: shown while a session lives in this tab. */}
      <span
        className={`tab-badge${tab.activity === 'running' ? ' running' : ''}`}
        title={
          tab.activity === 'running'
            ? 'Claude Code 実行中'
            : tab.activity === 'permission'
              ? 'Claude Code 許可待ち'
              : tab.activity === 'idle'
                ? 'Claude Code 入力待ち'
                : undefined
        }
      >
        {tab.activity === 'running'
          ? '✳'
          : tab.activity === 'permission'
            ? '🔔'
            : tab.activity === 'idle'
              ? '💤'
              : ''}
      </span>
      {editing ? (
        <input
          className="tab-rename-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tab-label">
          <span className="tab-title">{tabLabel(tab)}</span>
          {tab.cwd && <span className="tab-cwd">{tab.cwd.replace(/^\/home\/[^/]+/, '~')}</span>}
        </span>
      )}
      <button
        className="tab-close"
        title="セッションタブを閉じる"
        onClick={(e) => {
          e.stopPropagation()
          window.petaterm.ptyDispose(tab.id)
          removeTab(tab.id)
        }}
      >
        ×
      </button>
    </div>
  )
}
