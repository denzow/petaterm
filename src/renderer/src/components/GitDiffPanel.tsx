import { useCallback, useEffect, useState } from 'react'
import { GitDiffFile, GitOverview } from '../../../shared/ipc'
import { Tab } from '../stores/tabs'
import { DiffViewer } from './DiffViewer'

interface GitDiffPanelProps {
  tab: Tab
}

export function GitDiffPanel({ tab }: GitDiffPanelProps): React.JSX.Element {
  const [overview, setOverview] = useState<GitOverview | null>(null)
  const [diff, setDiff] = useState<GitDiffFile[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
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

  const run = async (op: () => Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    const result = await op()
    // refresh() clears the error first, so set it afterwards to keep it visible.
    await refresh()
    if (!result.ok) setError(result.error ?? '操作に失敗しました')
  }

  const checkout = async (branch: string): Promise<void> => {
    if (!branch || branch === overview?.currentBranch) return
    await run(() => window.petaterm.gitCheckout(tab.cwd, branch))
  }

  const createBranch = async (): Promise<void> => {
    const name = newBranch.trim()
    if (!name) return
    await run(() => window.petaterm.gitCreateBranch(tab.cwd, name))
    setNewBranch('')
  }

  const commit = async (): Promise<void> => {
    const message = commitMessage.trim()
    if (!message || diff.length === 0) return
    await run(() => window.petaterm.gitCommit(tab.cwd, message))
    setCommitMessage('')
  }

  const sendToClaude = (text: string): void => {
    // Bracketed paste keeps multi-line text as a single paste for the
    // receiving app (Claude Code / readline).
    window.petaterm.ptyWrite(tab.id, `\x1b[200~${text}\x1b[201~`)
  }

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
          {error && <div className="git-error">{error}</div>}

          <div className="git-branch-row">
            <label>ブランチ</label>
            <select value={overview.currentBranch} onChange={(e) => void checkout(e.target.value)}>
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

          <div className="git-commit-box">
            <textarea
              placeholder="コミットメッセージ"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />
            <div className="git-commit-actions">
              <span className="git-commit-hint">
                {diff.length === 0
                  ? '変更はありません'
                  : `${diff.length} ファイルを全てステージしてコミット`}
              </span>
              <button
                className="primary"
                disabled={!commitMessage.trim() || diff.length === 0}
                onClick={() => void commit()}
              >
                コミット
              </button>
            </div>
          </div>

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
