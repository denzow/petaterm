import { useState } from 'react'
import { GitDiffFile, GitDiffHunk, GitDiffLine } from '../../../shared/ipc'

interface Selection {
  filePath: string
  hunkIndex: number
  start: number // line index within the hunk (inclusive)
  end: number
}

interface DiffViewerProps {
  files: GitDiffFile[]
  onSend: (text: string) => void
}

/**
 * Renders the working-tree diff. Clicking a line selects it (shift+click
 * extends the range within the same hunk); a comment box then lets the user
 * send the quoted lines with a comment to the tab's Claude Code session.
 */
export function DiffViewer({ files, onSend }: DiffViewerProps): React.JSX.Element {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [comment, setComment] = useState('')

  const handleLineClick = (
    filePath: string,
    hunkIndex: number,
    lineIndex: number,
    shiftKey: boolean
  ): void => {
    setSelection((prev) => {
      if (
        shiftKey &&
        prev &&
        prev.filePath === filePath &&
        prev.hunkIndex === hunkIndex
      ) {
        return {
          ...prev,
          start: Math.min(prev.start, lineIndex),
          end: Math.max(prev.end, lineIndex)
        }
      }
      if (prev && prev.filePath === filePath && prev.hunkIndex === hunkIndex && prev.start === lineIndex && prev.end === lineIndex) {
        return null // click on the sole selected line deselects
      }
      return { filePath, hunkIndex, start: lineIndex, end: lineIndex }
    })
  }

  const send = (file: GitDiffFile, hunk: GitDiffHunk): void => {
    if (!selection || !comment.trim()) return
    const lines = hunk.lines.slice(selection.start, selection.end + 1)
    const lineNumbers = lines
      .map((l) => l.newLine ?? l.oldLine)
      .filter((n): n is number => n !== null)
    const range =
      lineNumbers.length === 0
        ? ''
        : lineNumbers.length === 1 || lineNumbers[0] === lineNumbers[lineNumbers.length - 1]
          ? ` (${lineNumbers[0]}行目)`
          : ` (${lineNumbers[0]}〜${lineNumbers[lineNumbers.length - 1]}行目)`
    const quoted = lines.map((l) => `> ${prefixOf(l)}${l.text}`).join('\n')
    const text = [
      '以下の diff についての指摘です:',
      '',
      `ファイル: ${file.path}${range}`,
      quoted,
      '',
      `コメント: ${comment.trim()}`
    ].join('\n')
    onSend(text)
    setSelection(null)
    setComment('')
  }

  return (
    <div className="diff-viewer">
      {files.map((file) => (
        <div key={file.path} className="diff-file">
          <div className="diff-file-header">
            <span className={`diff-status diff-status-${file.status}`}>
              {file.status === 'added'
                ? 'A'
                : file.status === 'deleted'
                  ? 'D'
                  : file.status === 'renamed'
                    ? 'R'
                    : 'M'}
            </span>
            <span className="diff-file-path">
              {file.status === 'renamed' && file.oldPath ? `${file.oldPath} → ` : ''}
              {file.path}
            </span>
          </div>
          {file.hunks.map((hunk, hunkIndex) => {
            const selected =
              selection && selection.filePath === file.path && selection.hunkIndex === hunkIndex
                ? selection
                : null
            return (
              <div key={hunkIndex} className="diff-hunk">
                <div className="diff-hunk-header">{hunk.header}</div>
                {hunk.lines.map((line, lineIndex) => (
                  <div
                    key={lineIndex}
                    className={[
                      'diff-line',
                      `diff-line-${line.type}`,
                      selected && lineIndex >= selected.start && lineIndex <= selected.end
                        ? 'diff-line-selected'
                        : ''
                    ].join(' ')}
                    onClick={(e) => handleLineClick(file.path, hunkIndex, lineIndex, e.shiftKey)}
                  >
                    <span className="diff-line-num">{line.oldLine ?? ''}</span>
                    <span className="diff-line-num">{line.newLine ?? ''}</span>
                    <span className="diff-line-text">
                      {prefixOf(line)}
                      {line.text}
                    </span>
                  </div>
                ))}
                {selected && (
                  <div className="diff-comment-box">
                    <textarea
                      autoFocus
                      placeholder="このコードへのコメント… (Claude Code に送信されます)"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                    <div className="diff-comment-actions">
                      <button
                        onClick={() => {
                          setSelection(null)
                          setComment('')
                        }}
                      >
                        キャンセル
                      </button>
                      <button
                        className="primary"
                        disabled={!comment.trim()}
                        onClick={() => send(file, hunk)}
                      >
                        Claude に送る
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function prefixOf(line: GitDiffLine): string {
  return line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
}
