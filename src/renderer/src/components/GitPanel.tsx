import { useCallback, useEffect, useState } from 'react'
import { GitDiffFile, GitLogEntry, GitOverview } from '../../../shared/ipc'
import { Tab } from '../stores/tabs'
import { DiffViewer } from './DiffViewer'

interface GitPanelProps {
  tab: Tab
}

type GitTab = 'changes' | 'log'

export function GitPanel({ tab }: GitPanelProps): React.JSX.Element {
  const [gitTab, setGitTab] = useState<GitTab>('changes')
  const [overview, setOverview] = useState<GitOverview | null>(null)
  const [diff, setDiff] = useState<GitDiffFile[]>([])
  const [log, setLog] = useState<GitLogEntry[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!tab.cwd) return
    setLoading(true)
    setError('')
    try {
      const ov = await window.petaterm.gitOverview(tab.cwd)
      setOverview(ov)
      if (ov.isRepo) {
        setDiff(await window.petaterm.gitDiff(tab.cwd))
        setLog(await window.petaterm.gitLog(tab.cwd))
      } else {
        setDiff([])
        setLog([])
      }
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

  const undoLastCommit = async (): Promise<void> => {
    setConfirmUndo(false)
    await run(() => window.petaterm.gitUndoCommit(tab.cwd))
  }

  const revert = async (hash: string): Promise<void> => {
    await run(() => window.petaterm.gitRevert(tab.cwd, hash))
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
      </div>

      {!overview?.isRepo ? (
        <div className="git-panel-empty">
          {loading ? '読み込み中…' : 'このディレクトリは Git リポジトリではありません'}
        </div>
      ) : (
        <>
          <div className="git-subtabs">
            <button
              className={`git-subtab${gitTab === 'changes' ? ' active' : ''}`}
              onClick={() => setGitTab('changes')}
            >
              変更
            </button>
            <button
              className={`git-subtab${gitTab === 'log' ? ' active' : ''}`}
              onClick={() => setGitTab('log')}
            >
              ログ
            </button>
          </div>

          {error && <div className="git-error">{error}</div>}

          {gitTab === 'changes' ? (
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

              <div className="git-commit-box">
                <textarea
                  placeholder="コミットメッセージ"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                />
                <div className="git-commit-actions">
                  <span className="git-commit-hint">
                    {diff.length === 0 ? '変更はありません' : `${diff.length} ファイルを全てステージしてコミット`}
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
          ) : (
            <>
              <div className="git-log-toolbar">
                {confirmUndo ? (
                  <>
                    <span className="git-log-confirm">最新のコミットを取り消しますか？</span>
                    <button className="danger" onClick={() => void undoLastCommit()}>
                      取り消す
                    </button>
                    <button onClick={() => setConfirmUndo(false)}>やめる</button>
                  </>
                ) : (
                  <button
                    disabled={log.length === 0}
                    onClick={() => setConfirmUndo(true)}
                    title="git reset --mixed HEAD~1（変更は作業ツリーに残ります）"
                  >
                    最新のコミットを取り消す
                  </button>
                )}
              </div>
              <div className="git-log-area">
                {log.length === 0 ? (
                  <div className="git-panel-empty">コミットがありません</div>
                ) : (
                  <div className="git-log-list">
                    {log.map((c) => (
                      <div key={c.hash} className={`git-log-item${c.isHead ? ' head' : ''}`}>
                        <div className="git-log-main">
                          <span className="git-log-hash">{c.shortHash}</span>
                          <span className="git-log-subject">{c.subject}</span>
                          {c.isHead && <span className="git-log-badge">HEAD</span>}
                        </div>
                        <div className="git-log-meta">
                          <span>{c.author}</span>
                          <span>{c.date.slice(0, 10)}</span>
                          <button
                            className="git-log-revert"
                            onClick={() => void revert(c.hash)}
                            title="このコミットを打ち消す新しいコミットを作成"
                          >
                            打ち消し
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
