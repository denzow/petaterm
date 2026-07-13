import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { FsEntry } from '../../../shared/ipc'
import { fileIconUrl } from '../file-icons'
import { openFile, resolveOpener, useFileOpenersStore } from '../stores/file-openers'
import { Tab } from '../stores/tabs'

interface FilesPanelProps {
  tab: Tab
}

/**
 * Expansion / focus state lifted to the panel so the keyboard handler can
 * drive the whole tree; rows read it via context. Paths are absolute.
 */
interface TreeControl {
  expanded: Set<string>
  toggleDir: (path: string) => void
  focused: string | null
  setFocused: (path: string) => void
  /** Incremental filter, normalized (trimmed, lowercase); '' = no filter. */
  filter: string
}

const TreeContext = createContext<TreeControl>({
  expanded: new Set(),
  toggleDir: () => {},
  focused: null,
  setFocused: () => {},
  filter: ''
})

/**
 * File tree rooted at the tab's current directory. Follows the shell's cwd
 * automatically (tab.cwd is kept current by cwd-tracker). Clicking a
 * directory expands its children inline; files open with the OS default app
 * on double-click. Keyboard: ↑/↓ move, →/← expand/collapse (← on a leaf
 * jumps to the parent), Enter opens, any printable key starts the
 * incremental name filter (Esc clears it).
 */
export function FilesPanel({ tab }: FilesPanelProps): React.JSX.Element {
  const [error, setError] = useState('')
  // Bumping this refetches every mounted level while keeping expansion state.
  const [refreshKey, setRefreshKey] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [focused, setFocused] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const areaRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const refresh = (): void => {
    setError('')
    setRefreshKey((k) => k + 1)
  }

  // Expansion (and focus) reset when the tree follows the shell into a
  // different directory — same behavior as the old per-row state, which the
  // path-keyed remount used to guarantee.
  useEffect(() => {
    setExpanded(new Set())
    setFocused(null)
    setFilter('')
  }, [tab.cwd])

  // Keys should work the moment the panel is opened, without a click first.
  useEffect(() => {
    areaRef.current?.focus()
  }, [])

  const toggleDir = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    // App-level shortcuts (Ctrl+←/→ など) keep their meaning inside the panel.
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const area = areaRef.current
    if (!area) return
    // Document order — exactly the visual order of the rendered rows.
    const rows = [...area.querySelectorAll<HTMLElement>('.files-item[data-path]')]
    if (rows.length === 0) return
    const index = rows.findIndex((r) => r.dataset.path === focused)
    const row = index === -1 ? null : rows[index]
    const path = row?.dataset.path ?? null
    const isDir = row?.dataset.isdir === '1'
    const isOpen = path !== null && expanded.has(path)

    const focusRow = (target: HTMLElement | undefined): void => {
      if (!target?.dataset.path) return
      setFocused(target.dataset.path)
      target.scrollIntoView({ block: 'nearest' })
    }

    switch (e.key) {
      case 'ArrowDown':
        focusRow(rows[index === -1 ? 0 : Math.min(index + 1, rows.length - 1)])
        break
      case 'ArrowUp':
        focusRow(rows[index === -1 ? 0 : Math.max(index - 1, 0)])
        break
      case 'ArrowRight':
        if (!path || !isDir) return
        if (!isOpen) toggleDir(path)
        else focusRow(rows[Math.min(index + 1, rows.length - 1)]) // into the first child
        break
      case 'ArrowLeft': {
        if (!path) return
        if (isDir && isOpen) {
          toggleDir(path)
          break
        }
        const parent = rows.find((r) => r.dataset.path === path.slice(0, path.lastIndexOf('/')))
        focusRow(parent)
        break
      }
      case 'Enter':
        if (!path) return
        if (isDir) toggleDir(path)
        else
          void openFile(path).then((result) => {
            setError(result.ok ? '' : result.error)
          })
        break
      default:
        // Type-to-filter: a printable key moves focus to the filter input
        // before the text lands, so the character starts the filter.
        if (e.key.length === 1) filterRef.current?.focus()
        return
    }
    e.preventDefault()
  }

  // Hand focus back to the tree; make sure some visible row carries the
  // keyboard cursor (filtering may have removed the previous one).
  const focusTree = (): void => {
    const area = areaRef.current
    if (!area) return
    area.focus()
    const rows = [...area.querySelectorAll<HTMLElement>('.files-item[data-path]')]
    if (!rows.some((r) => r.dataset.path === focused) && rows[0]?.dataset.path) {
      setFocused(rows[0].dataset.path)
    }
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">files</span>
        <span className="git-panel-cwd" title={tab.cwd}>
          {tab.cwd.replace(/^\/home\/[^/]+/, '~')}
        </span>
        <input
          ref={filterRef}
          className="files-filter"
          value={filter}
          placeholder="絞り込み"
          title="名前の部分一致で絞り込み / Escでクリア"
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setFilter('')
              focusTree()
            } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
              focusTree()
            } else {
              return
            }
            e.preventDefault()
          }}
        />
        {filter && (
          <button className="icon-button" onClick={() => { setFilter(''); focusTree() }} title="絞り込みをクリア">
            ×
          </button>
        )}
        <button className="icon-button" onClick={refresh} title="更新">
          ⟳
        </button>
      </div>

      {error && <div className="git-error">{error}</div>}

      <div
        className="files-area"
        ref={areaRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        title="↑↓で移動 / →←で開閉 / Enterで開く / 文字入力で絞り込み"
      >
        <div className="files-list">
          {tab.cwd && (
            <TreeContext.Provider
              value={{ expanded, toggleDir, focused, setFocused, filter: filter.trim().toLowerCase() }}
            >
              <DirChildren dir={tab.cwd} depth={0} refreshKey={refreshKey} onError={setError} />
            </TreeContext.Provider>
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
  const { expanded, filter } = useContext(TreeContext)
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

  // Filtering: name substring match. Expanded directories stay visible even
  // without a match — they are the path to deeper matches (rendered dimmed).
  const visible = filter
    ? sorted.filter(
        (e) => e.name.toLowerCase().includes(filter) || (e.isDir && expanded.has(`${dir}/${e.name}`))
      )
    : sorted
  if (visible.length === 0) {
    return (
      <div className="files-note" style={indent}>
        (一致なし)
      </div>
    )
  }

  return (
    <>
      {visible.map((e) => (
        // Keyed by full path so rows reset when the tree follows the shell
        // into a different directory.
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
  const { expanded, toggleDir, focused, setFocused, filter } = useContext(TreeContext)
  const path = `${dir}/${entry.name}`
  const open = entry.isDir && expanded.has(path)
  // Visible only as the path to deeper matches, not a match itself.
  const dim = filter !== '' && !entry.name.toLowerCase().includes(filter)

  const openEntry = async (): Promise<void> => {
    // Files open with the configured app (extension or MIME match) when
    // there is one, otherwise the OS default; directories open in the file
    // manager.
    const result = await openFile(path)
    onError(result.ok ? '' : result.error)
  }

  return (
    <>
      <div
        className={`files-item${entry.isDir ? ' dir' : ''}${focused === path ? ' focused' : ''}${dim ? ' dim' : ''}`}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        data-path={path}
        data-isdir={entry.isDir ? '1' : '0'}
        onClick={() => {
          setFocused(path)
          if (entry.isDir) toggleDir(path)
        }}
        onDoubleClick={() => {
          if (!entry.isDir) void openEntry()
        }}
        onContextMenu={(ev) => {
          ev.preventDefault()
          setFocused(path)
          const { clientX, clientY } = ev
          // The menu's 開く honors the configured opener like double-click
          // does; MIME patterns make the lookup async.
          void (async () => {
            const opener = entry.isDir
              ? null
              : await resolveOpener(path, useFileOpenersStore.getState().openers)
            await window.petaterm.fsContextMenu(path, clientX, clientY, opener?.desktopFile)
          })()
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
      {open && <DirChildren dir={path} depth={depth + 1} refreshKey={refreshKey} onError={onError} />}
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
