import { useCallback, useEffect, useState } from 'react'
import { GitDiffFile, GitOverview } from '../../../shared/ipc'
import { Tab } from '../stores/tabs'
import { DiffViewer } from './DiffViewer'

interface GitPanelProps {
  tab: Tab
  onClose: () => void
}

export function GitPanel({ tab, onClose }: GitPanelProps): React.JSX.Element {
  const [overview, setOverview] = useState<GitOverview | null>(null)
  const [diff, setDiff] = useState<GitDiffFile[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!tab.cwd) return
    setLoading(true)
    setError('')
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

  const checkout = async (branch: string): Promise<void> => {
    if (!branch || branch === overview?.currentBranch) return
    const result = await window.petaterm.gitCheckout(tab.cwd, branch)
    if (!result.ok) setError(result.error)
    await refresh()
  }

  const createBranch = async (): Promise<void> => {
    const name = newBranch.trim()
    if (!name) return
    const result = await window.petaterm.gitCreateBranch(tab.cwd, name)
    if (result.ok) setNewBranch('')
    else setError(result.error)
    await refresh()
  }

  const sendToClaude = (text: string): void => {
    // Bracketed paste keeps multi-line text as a single paste for the
    // receiving app (Claude Code / readline).
    window.petaterm.ptyWrite(tab.id, `\x1b[200~${text}\x1b[201~`)
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">Git</span>
        <span className="git-panel-cwd" title={tab.cwd}>
          {tab.cwd.replace(/^\/home\/[^/]+/, '~')}
        </span>
        <button className="icon-button" onClick={() => void refresh()} title="更新">
          ⟳
        </button>
        <button className="icon-button" onClick={onClose} title="閉じる">
          ×
        </button>
      </div>

      {!overview?.isRepo ? (
        <div className="git-panel-empty">
          {loading ? '読み込み中…' : 'このディレクトリは Git リポジトリではありません'}
        </div>
      ) : (
        <>
          <div className="git-branch-row">
            <label>ブランチ</label>
            <select
              value={overview.currentBranch}
              onChange={(e) => void checkout(e.target.value)}
            >
              {overview.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="git-branch-row">
            <input
              placeholder="新しいブランチ名"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createBranch()
              }}
            />
            <button onClick={() => void createBranch()}>作成</button>
          </div>
          {error && <div className="git-error">{error}</div>}

          <div className="git-diff-area">
            {diff.length === 0 ? (
              <div className="git-panel-empty">変更はありません</div>
            ) : (
              <DiffViewer files={diff} onSend={sendToClaude} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
