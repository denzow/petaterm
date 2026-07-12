import { useState } from 'react'
import { Tab, tabLabel, useTabsStore } from '../stores/tabs'
import { useBookmarksStore } from '../stores/bookmarks'
import { formatBinding, useKeybindingsStore } from '../stores/keybindings'

interface SidebarProps {
  onOpenSettings: () => void
  onOpenBookmarks: () => void
}

export function Sidebar({ onOpenSettings, onOpenBookmarks }: SidebarProps): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const addTab = useTabsStore((s) => s.addTab)
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark)
  const activeCwd = tabs.find((t) => t.id === activeTabId)?.cwd ?? ''
  const activeBookmarked = useBookmarksStore((s) => s.isBookmarked(activeCwd))
  const bookmarksCombo = useKeybindingsStore((s) => formatBinding(s.bindings.openBookmarks))

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        {tabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} active={tab.id === activeTabId} />
        ))}
      </div>
      <div className="sidebar-footer">
        <button className="sidebar-button" onClick={() => addTab()} title="新しいセッションタブ">
          ＋ 新しいセッションタブ
        </button>
        <button
          className={`sidebar-button${activeBookmarked ? ' active' : ''}`}
          onClick={() => toggleBookmark(activeCwd)}
          disabled={!activeCwd}
          title={
            activeBookmarked
              ? 'このディレクトリのブックマークを解除'
              : '現在のディレクトリをブックマーク'
          }
        >
          {activeBookmarked ? '★ ブックマーク済み' : '☆ ディレクトリをブックマーク'}
        </button>
        <button
          className="sidebar-button"
          onClick={onOpenBookmarks}
          title={`ブックマーク一覧 (${bookmarksCombo})`}
        >
          ≡ ブックマーク一覧
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
      {/* Marker column: a prompt caret for a plain shell, or the Claude Code
          session lamp (running / permission / idle) drawn by CSS. */}
      <span
        className={`tab-marker${tab.activity ? ` ${tab.activity}` : ''}`}
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
        {tab.activity ? '' : '❯'}
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
