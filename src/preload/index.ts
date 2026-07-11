import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  FsListResult,
  FsOpenResult,
  GitDiffFile,
  GitLogEntry,
  GitOverview,
  GitResult,
  IPC,
  PtyDataEvent,
  PtyExitEvent,
  TabActivityEvent,
  TabCwdEvent
} from '../shared/ipc'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  ptyCreate: (tabId: string, cwd?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.PtyCreate, { tabId, cwd }),
  ptyWrite: (tabId: string, data: string): void =>
    ipcRenderer.send(IPC.PtyWrite, { tabId, data }),
  ptyResize: (tabId: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.PtyResize, { tabId, cols, rows }),
  ptyDispose: (tabId: string): void => ipcRenderer.send(IPC.PtyDispose, { tabId }),

  onPtyData: (cb: (payload: PtyDataEvent) => void): (() => void) => subscribe(IPC.PtyData, cb),
  onPtyExit: (cb: (payload: PtyExitEvent) => void): (() => void) => subscribe(IPC.PtyExit, cb),
  onTabCwd: (cb: (payload: TabCwdEvent) => void): (() => void) => subscribe(IPC.TabCwd, cb),
  onTabActivity: (cb: (payload: TabActivityEvent) => void): (() => void) =>
    subscribe(IPC.TabActivity, cb),

  fsList: (dir: string): Promise<FsListResult> => ipcRenderer.invoke(IPC.FsList, dir),
  fsOpen: (target: string): Promise<FsOpenResult> => ipcRenderer.invoke(IPC.FsOpen, target),
  fsContextMenu: (target: string, x: number, y: number): Promise<void> =>
    ipcRenderer.invoke(IPC.FsContextMenu, target, x, y),

  gitOverview: (cwd: string): Promise<GitOverview> => ipcRenderer.invoke(IPC.GitOverview, cwd),
  gitCheckout: (cwd: string, branch: string): Promise<GitResult> =>
    ipcRenderer.invoke(IPC.GitCheckout, cwd, branch),
  gitCreateBranch: (cwd: string, branch: string): Promise<GitResult> =>
    ipcRenderer.invoke(IPC.GitCreateBranch, cwd, branch),
  gitDiff: (cwd: string): Promise<GitDiffFile[]> => ipcRenderer.invoke(IPC.GitDiff, cwd),
  gitLog: (cwd: string): Promise<GitLogEntry[]> => ipcRenderer.invoke(IPC.GitLog, cwd),
  gitCommit: (cwd: string, message: string): Promise<GitResult> =>
    ipcRenderer.invoke(IPC.GitCommit, cwd, message),
  gitUndoCommit: (cwd: string): Promise<GitResult> => ipcRenderer.invoke(IPC.GitUndoCommit, cwd),
  gitRevert: (cwd: string, hash: string): Promise<GitResult> =>
    ipcRenderer.invoke(IPC.GitRevert, cwd, hash)
}

export type PetatermApi = typeof api

contextBridge.exposeInMainWorld('petaterm', api)
