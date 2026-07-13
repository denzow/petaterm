import { useState } from 'react'
import { Tab, tabLabel, useTabsStore } from '../stores/tabs'
import { useBookmarksStore } from '../stores/bookmarks'
import { useNotificationsStore } from '../stores/notifications'
import { formatBinding, useKeybindingsStore } from '../stores/keybindings'

interface SidebarProps {
  onOpenSettings: () => void
  onOpenBookmarks: () => void
  onOpenNotifications: () => void
}

const WIDTH_KEY = 'petaterm.sidebarWidth'
const DEFAULT_WIDTH = 230
const MIN_WIDTH = 140
const MAX_WIDTH = 500

function loadWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_KEY))
  return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH
}

export function Sidebar({
  onOpenSettings,
  onOpenBookmarks,
  onOpenNotifications
}: SidebarProps): React.JSX.Element {
  const tabs = useTabsStore((s) => s.tabs)
  const activeTabId = useTabsStore((s) => s.activeTabId)
  const addTab = useTabsStore((s) => s.addTab)
  const bookmarksCombo = useKeybindingsStore((s) => formatBinding(s.bindings.openBookmarks))
  const unreadNotifs = useNotificationsStore((s) => s.unread)
  const [width, setWidth] = useState(loadWidth)

  // Pointer capture keeps the drag alive even when the cursor crosses into
  // the xterm canvas; the terminals refit themselves via ResizeObserver.
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const handle = e.currentTarget
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // No capturable pointer (e.g. the pointer was already released) —
      // the drag still works while the cursor stays on the handle.
    }
    // The sidebar's left edge is the window's left edge, so clientX is the width.
    const onMove = (ev: PointerEvent): void =>
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX)))
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      setWidth((w) => {
        localStorage.setItem(WIDTH_KEY, String(w))
        return w
      })
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  const resetWidth = (): void => {
    setWidth(DEFAULT_WIDTH)
    localStorage.setItem(WIDTH_KEY, String(DEFAULT_WIDTH))
  }

  return (
    <div className="sidebar" style={{ width }}>
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
          className="sidebar-button"
          onClick={onOpenBookmarks}
          title={`ブックマーク一覧 (${bookmarksCombo})`}
        >
          ≡ ブックマーク一覧
        </button>
        <button
          className="sidebar-button"
          onClick={onOpenNotifications}
          title="通知一覧（全タブ共通）"
        >
          ⚑ 通知
          {unreadNotifs > 0 && <span className="unread-badge">({unreadNotifs})</span>}
        </button>
        <button className="sidebar-button" onClick={onOpenSettings} title="設定">
          ⚙ 設定
        </button>
      </div>
      <div
        className="sidebar-resizer"
        onPointerDown={onResizeStart}
        onDoubleClick={resetWidth}
        title="ドラッグで幅を変更 / ダブルクリックで既定幅に戻す"
      />
    </div>
  )
}

function TabItem({ tab, active }: { tab: Tab; active: boolean }): React.JSX.Element {
  const activateTab = useTabsStore((s) => s.activateTab)
  const removeTab = useTabsStore((s) => s.removeTab)
  const renameTab = useTabsStore((s) => s.renameTab)
  const toggleBookmark = useBookmarksStore((s) => s.toggleBookmark)
  const bookmarked = useBookmarksStore((s) => s.isBookmarked(tab.cwd))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commitRename = (): void => {
    renameTab(tab.id, draft.trim() || null)
    setEditing(false)
  }

  return (
    <div
      className={`tab-item${active ? ' active' : ''}${tab.attention ? ' attention' : ''}`}
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
          <span className="tab-title">
            {tabLabel(tab)}
            {tab.runningProcess && (
              <span className="tab-process" title={`実行中: ${tab.runningProcess}`}>
                {tab.runningProcess}
              </span>
            )}
          </span>
          {tab.cwd && <span className="tab-cwd">{tab.cwd.replace(/^\/home\/[^/]+/, '~')}</span>}
        </span>
      )}
      {tab.cwd && (
        <button
          className={`tab-bookmark${bookmarked ? ' active' : ''}`}
          title={
            bookmarked ? 'このディレクトリのブックマークを解除' : 'このディレクトリをブックマーク'
          }
          onClick={(e) => {
            e.stopPropagation()
            toggleBookmark(tab.cwd)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          ★
        </button>
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
