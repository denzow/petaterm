// IPC channel names and payload types shared across main / preload / renderer.

export const IPC = {
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyDispose: 'pty:dispose',
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  TabCwd: 'tab:cwd',
  TabProcess: 'tab:process',
  TabActivity: 'tab:activity',
  AppNotification: 'notification:event',
  FsList: 'fs:list',
  FsOpen: 'fs:open',
  FsOpenWith: 'fs:open-with',
  FsListApps: 'fs:list-apps',
  FsMime: 'fs:mime',
  FsListMimeTypes: 'fs:list-mime-types',
  FsContextMenu: 'fs:context-menu',
  ShellOpenExternal: 'shell:open-external',
  GitOverview: 'git:overview',
  GitCheckout: 'git:checkout',
  GitCreateBranch: 'git:create-branch',
  GitDiff: 'git:diff',
  GitLog: 'git:log',
  GitCommit: 'git:commit',
  GitUndoCommit: 'git:undo-commit',
  GitRevert: 'git:revert',
  HotkeySet: 'hotkey:set'
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

export interface TabProcessEvent {
  tabId: string
  /** Foreground command name in the tab; null = shell prompt (idle). */
  process: string | null
}

/** Claude Code session status, derived from hook events. */
export type TabActivityState = 'running' | 'permission' | 'idle'

export interface TabActivityEvent {
  tabId: string
  /** null = the Claude Code session ended; the tab's status icon disappears. */
  state: TabActivityState | null
  message: string
}

/** Notification-worthy hook events, mirrored into the in-app history. */
export type AppNotificationKind = 'permission' | 'idle' | 'stop'

export interface AppNotificationEvent {
  tabId: string
  kind: AppNotificationKind
  title: string
  message: string
  /** Repo (or cwd) basename of the tab's session; null when unknown. */
  source: string | null
  /** Epoch milliseconds when the hook event was received. */
  timestamp: number
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

/** An installed desktop application, selectable as a per-extension opener. */
export interface FsAppInfo {
  name: string
  /** Absolute path to the .desktop file — the stable id stored in settings. */
  desktopFile: string
}

export interface GitOverview {
  isRepo: boolean
  currentBranch: string
  branches: string[]
  hasCommits: boolean
}

export type GitResult = { ok: true } | { ok: false; error: string }

/** Outcome of registering the global summon hotkey (the OS grab can fail). */
export type HotkeyRegisterResult = { ok: true } | { ok: false; error: string }

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
