// IPC channel names and payload types shared across main / preload / renderer.

export const IPC = {
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyDispose: 'pty:dispose',
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  TabCwd: 'tab:cwd',
  TabActivity: 'tab:activity',
  FsList: 'fs:list',
  FsOpen: 'fs:open',
  FsContextMenu: 'fs:context-menu',
  GitOverview: 'git:overview',
  GitCheckout: 'git:checkout',
  GitCreateBranch: 'git:create-branch',
  GitDiff: 'git:diff',
  GitLog: 'git:log',
  GitCommit: 'git:commit',
  GitUndoCommit: 'git:undo-commit',
  GitRevert: 'git:revert'
} as const

export interface PtyCreateRequest {
  tabId: string
  cwd?: string
}

export interface PtyDataEvent {
  tabId: string
  data: string
}

export interface PtyExitEvent {
  tabId: string
  exitCode: number
}

export interface TabCwdEvent {
  tabId: string
  cwd: string
}

/** Claude Code session status, derived from hook events. */
export type TabActivityState = 'running' | 'permission' | 'idle'

export interface TabActivityEvent {
  tabId: string
  /** null = the Claude Code session ended; the tab's status icon disappears. */
  state: TabActivityState | null
  message: string
}

export interface FsEntry {
  name: string
  isDir: boolean
  /** Bytes; null for directories and unreadable entries (e.g. broken symlinks). */
  size: number | null
  /** Epoch milliseconds; null when unreadable. */
  mtime: number | null
}

export type FsListResult = { ok: true; entries: FsEntry[] } | { ok: false; error: string }

export type FsOpenResult = { ok: true } | { ok: false; error: string }

export interface GitOverview {
  isRepo: boolean
  currentBranch: string
  branches: string[]
  hasCommits: boolean
}

export type GitResult = { ok: true } | { ok: false; error: string }

export type DiffLineType = 'add' | 'del' | 'context'

export interface GitDiffLine {
  type: DiffLineType
  text: string
  oldLine: number | null
  newLine: number | null
}

export interface GitDiffHunk {
  header: string
  lines: GitDiffLine[]
}

export type DiffFileStatus = 'modified' | 'added' | 'deleted' | 'renamed'

export interface GitDiffFile {
  path: string
  oldPath: string | null
  status: DiffFileStatus
  hunks: GitDiffHunk[]
}

export interface GitLogEntry {
  hash: string
  shortHash: string
  subject: string
  author: string
  /** ISO-ish date string from git (e.g. "2026-07-11 10:59:22 +0900"). */
  date: string
  isHead: boolean
}
