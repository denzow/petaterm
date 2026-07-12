import { useEffect, useState } from 'react'
import { FsEntry } from '../../../shared/ipc'
import { fileIconUrl } from '../file-icons'
import { Tab } from '../stores/tabs'

interface FilesPanelProps {
  tab: Tab
}

/**
 * File tree rooted at the tab's current directory. Follows the shell's cwd
 * automatically (tab.cwd is kept current by cwd-tracker). Clicking a
 * directory expands its children inline; files open with the OS default app
 * on double-click.
 */
export function FilesPanel({ tab }: FilesPanelProps): React.JSX.Element {
  const [error, setError] = useState('')
  // Bumping this refetches every mounted level while keeping expansion state.
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = (): void => {
    setError('')
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">files</span>
        <span className="git-panel-cwd" title={tab.cwd}>
          {tab.cwd.replace(/^\/home\/[^/]+/, '~')}
        </span>
        <button className="icon-button" onClick={refresh} title="更新">
          ⟳
        </button>
      </div>

      {error && <div className="git-error">{error}</div>}

      <div className="files-area">
        <div className="files-list">
          {tab.cwd && (
            <DirChildren dir={tab.cwd} depth={0} refreshKey={refreshKey} onError={setError} />
          )}
        </div>
      </div>
    </div>
  )
}

interface DirChildrenProps {
  dir: string
  depth: number
  refreshKey: number
  onError: (message: string) => void
}

function DirChildren({ dir, depth, refreshKey, onError }: DirChildrenProps): React.JSX.Element {
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [listError, setListError] = useState('')

  // No cache: collapsing and re-expanding a directory remounts this component,
  // which re-reads the directory — free freshness.
  useEffect(() => {
    let cancelled = false
    setListError('')
    void window.petaterm.fsList(dir).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setEntries(result.entries)
      } else {
        setEntries([])
        setListError(result.error)
      }
    })
    return () => {
      cancelled = true
    }
  }, [dir, refreshKey])

  const indent = { paddingLeft: `${10 + depth * 16}px` }

  if (listError) {
    return (
      <div className="files-note" style={indent}>
        {listError}
      </div>
    )
  }
  if (entries === null) {
    return (
      <div className="files-note" style={indent}>
        読み込み中…
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="files-note" style={indent}>
        {depth === 0 ? '空のディレクトリです' : '(空)'}
      </div>
    )
  }

  const sorted = [...entries].sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, 'ja')
  )

  return (
    <>
      {sorted.map((e) => (
        // Keyed by full path so rows (and their expansion state) reset when
        // the tree follows the shell into a different directory.
        <EntryRow
          key={`${dir}/${e.name}`}
          dir={dir}
          entry={e}
          depth={depth}
          refreshKey={refreshKey}
          onError={onError}
        />
      ))}
    </>
  )
}

interface EntryRowProps {
  dir: string
  entry: FsEntry
  depth: number
  refreshKey: number
  onError: (message: string) => void
}

function EntryRow({ dir, entry, depth, refreshKey, onError }: EntryRowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const path = `${dir}/${entry.name}`

  const openWithOS = async (): Promise<void> => {
    // Files open in the OS default app; directories open in the file manager.
    const result = await window.petaterm.fsOpen(path)
    onError(result.ok ? '' : result.error)
  }

  return (
    <>
      <div
        className={`files-item${entry.isDir ? ' dir' : ''}`}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        onClick={() => {
          if (entry.isDir) setOpen((o) => !o)
        }}
        onDoubleClick={() => {
          if (!entry.isDir) void openWithOS()
        }}
        onContextMenu={(ev) => {
          ev.preventDefault()
          void window.petaterm.fsContextMenu(path, ev.clientX, ev.clientY)
        }}
        title={
          entry.isDir
            ? 'クリックで開閉 / 右クリックでメニュー'
            : 'ダブルクリックで開く / 右クリックでメニュー'
        }
      >
        <span className="files-caret">{entry.isDir ? (open ? '▾' : '▸') : ''}</span>
        <img
          className="files-icon"
          src={fileIconUrl(entry.name, entry.isDir, open)}
          alt=""
          draggable={false}
        />
        <span className="files-name">{entry.name}</span>
        <span className="files-size">{entry.isDir ? '' : formatSize(entry.size)}</span>
        <span className="files-mtime">{formatMtime(entry.mtime)}</span>
      </div>
      {entry.isDir && open && (
        <DirChildren dir={path} depth={depth + 1} refreshKey={refreshKey} onError={onError} />
      )}
    </>
  )
}

function formatSize(size: number | null): string {
  if (size === null) return ''
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size
  let unit = ''
  for (const u of units) {
    value /= 1024
    unit = u
    if (value < 1024) break
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

function formatMtime(mtime: number | null): string {
  if (mtime === null) return ''
  const d = new Date(mtime)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
