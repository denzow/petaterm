import { useCallback, useEffect, useState } from 'react'
import { FsEntry } from '../../../shared/ipc'
import { fileIconUrl } from '../file-icons'
import { Tab } from '../stores/tabs'

interface FilesPanelProps {
  tab: Tab
}

/**
 * Lists the entries directly under the tab's current directory. Follows the
 * shell's cwd automatically (tab.cwd is kept current by cwd-tracker).
 */
export function FilesPanel({ tab }: FilesPanelProps): React.JSX.Element {
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!tab.cwd) return
    setLoading(true)
    try {
      const result = await window.petaterm.fsList(tab.cwd)
      if (result.ok) {
        setEntries(result.entries)
        setError('')
      } else {
        setEntries([])
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }, [tab.cwd])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const open = async (entry: FsEntry): Promise<void> => {
    // Files open in the OS default app; directories open in the file manager.
    const result = await window.petaterm.fsOpen(`${tab.cwd}/${entry.name}`)
    setError(result.ok ? '' : result.error)
  }

  const sorted = [...entries].sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, 'ja')
  )

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">files</span>
        <span className="git-panel-cwd" title={tab.cwd}>
          {tab.cwd.replace(/^\/home\/[^/]+/, '~')}
        </span>
        <button className="icon-button" onClick={() => void refresh()} title="更新">
          ⟳
        </button>
      </div>

      {error && <div className="git-error">{error}</div>}

      <div className="files-area">
        {sorted.length === 0 ? (
          <div className="git-panel-empty">
            {loading ? '読み込み中…' : error ? '' : '空のディレクトリです'}
          </div>
        ) : (
          <div className="files-list">
            {sorted.map((e) => (
              <div
                key={e.name}
                className={`files-item${e.isDir ? ' dir' : ''}`}
                onDoubleClick={() => void open(e)}
                onContextMenu={(ev) => {
                  ev.preventDefault()
                  void window.petaterm.fsContextMenu(`${tab.cwd}/${e.name}`, ev.clientX, ev.clientY)
                }}
                title="ダブルクリックで開く / 右クリックでメニュー"
              >
                <img
                  className="files-icon"
                  src={fileIconUrl(e.name, e.isDir)}
                  alt=""
                  draggable={false}
                />
                <span className="files-name">{e.name}</span>
                <span className="files-size">{e.isDir ? '' : formatSize(e.size)}</span>
                <span className="files-mtime">{formatMtime(e.mtime)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
