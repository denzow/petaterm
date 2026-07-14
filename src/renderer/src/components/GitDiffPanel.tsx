import { useCallback, useEffect, useRef, useState } from 'react'
import { GitDiffFile, GitOverview } from '../../../shared/ipc'
import { Tab } from '../stores/tabs'
import { DiffViewer, statusLetter } from './DiffViewer'

interface GitDiffPanelProps {
  tab: Tab
}

const LIST_WIDTH_KEY = 'petaterm.diffFileListWidth'
const DEFAULT_LIST_WIDTH = 210
const MIN_LIST_WIDTH = 120
const MAX_LIST_WIDTH = 600

function loadListWidth(): number {
  const raw = Number(localStorage.getItem(LIST_WIDTH_KEY))
  return Number.isFinite(raw) && raw >= MIN_LIST_WIDTH && raw <= MAX_LIST_WIDTH
    ? raw
    : DEFAULT_LIST_WIDTH
}

export function GitDiffPanel({ tab }: GitDiffPanelProps): React.JSX.Element {
  const [overview, setOverview] = useState<GitOverview | null>(null)
  const [diff, setDiff] = useState<GitDiffFile[]>([])
  const [loading, setLoading] = useState(false)
  // File-list highlight: the file whose diff is at the top of the viewport.
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [listWidth, setListWidth] = useState(loadListWidth)
  const diffScrollRef = useRef<HTMLDivElement>(null)
  const diffAreaRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!tab.cwd) return
    setLoading(true)
    try {
      const ov = await window.petaterm.gitOverview(tab.cwd)
      setOverview(ov)
      setDiff(ov.isRepo ? await window.petaterm.gitDiff(tab.cwd) : [])
    } finally {
      setLoading(false)
    }
  }, [tab.cwd])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sendToClaude = (text: string): void => {
    // Bracketed paste keeps multi-line text as a single paste for the
    // receiving app (Claude Code / readline).
    window.petaterm.ptyWrite(tab.id, `\x1b[200~${text}\x1b[201~`)
  }

  const jumpToFile = (path: string): void => {
    setActiveFile(path)
    diffScrollRef.current
      ?.querySelector(`[data-diff-file="${CSS.escape(path)}"]`)
      ?.scrollIntoView({ block: 'start' })
  }

  // Follow the scroll: highlight the last file whose diff starts at or above
  // the viewport top.
  const onDiffScroll = (): void => {
    const container = diffScrollRef.current
    if (!container) return
    const top = container.getBoundingClientRect().top
    let current: string | null = null
    for (const el of container.querySelectorAll<HTMLElement>('[data-diff-file]')) {
      if (el.getBoundingClientRect().top - top <= 8) current = el.dataset.diffFile ?? null
      else break
    }
    if (current) setActiveFile(current)
  }

  // Pointer capture keeps the drag alive once the cursor leaves the thin handle.
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const handle = e.currentTarget
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // No capturable pointer — the drag still works while the cursor stays on
      // the handle.
    }
    const left = diffAreaRef.current?.getBoundingClientRect().left ?? 0
    const onMove = (ev: PointerEvent): void =>
      setListWidth(Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, ev.clientX - left)))
    const onUp = (): void => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      setListWidth((w) => {
        localStorage.setItem(LIST_WIDTH_KEY, String(w))
        return w
      })
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  const resetListWidth = (): void => {
    setListWidth(DEFAULT_LIST_WIDTH)
    localStorage.setItem(LIST_WIDTH_KEY, String(DEFAULT_LIST_WIDTH))
  }

  // The remembered file may vanish on refresh — fall back to the first one.
  const highlighted = diff.some((f) => f.path === activeFile) ? activeFile : (diff[0]?.path ?? null)

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">diff</span>
        <span className="git-panel-cwd" title={tab.cwd}>
          {tab.cwd.replace(/^\/home\/[^/]+/, '~')}
        </span>
        <button className="icon-button" onClick={() => void refresh()} title="更新">
          ⟳
        </button>
      </div>

      {!overview?.isRepo ? (
        <div className="git-panel-empty">
          {loading ? '読み込み中…' : 'このディレクトリは Git リポジトリではありません'}
        </div>
      ) : (
        <>
          <div className="git-diff-area" ref={diffAreaRef}>
            {diff.length === 0 ? (
              <div className="git-panel-empty">変更はありません</div>
            ) : (
              <>
                <div className="diff-file-list" style={{ width: listWidth }}>
                  {diff.map((f) => {
                    const add = f.hunks.reduce(
                      (n, h) => n + h.lines.filter((l) => l.type === 'add').length,
                      0
                    )
                    const del = f.hunks.reduce(
                      (n, h) => n + h.lines.filter((l) => l.type === 'del').length,
                      0
                    )
                    return (
                      <div
                        key={f.path}
                        className={`diff-file-list-item${f.path === highlighted ? ' active' : ''}`}
                        title={f.path}
                        onClick={() => jumpToFile(f.path)}
                      >
                        <span className={`diff-status diff-status-${f.status}`}>
                          {statusLetter(f.status)}
                        </span>
                        <span className="diff-file-list-path">{f.path}</span>
                        <span className="diff-file-list-counts">
                          {add > 0 && <span className="add">+{add}</span>}
                          {del > 0 && <span className="del">−{del}</span>}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div
                  className="diff-file-list-resizer"
                  onPointerDown={onResizeStart}
                  onDoubleClick={resetListWidth}
                  title="ドラッグで幅を変更 / ダブルクリックで既定幅に戻す"
                />
                <div className="diff-scroll" ref={diffScrollRef} onScroll={onDiffScroll}>
                  <DiffViewer files={diff} onSend={sendToClaude} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
