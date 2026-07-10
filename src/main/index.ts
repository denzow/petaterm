import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import {
  GitResult,
  IPC,
  PtyCreateRequest,
  PtyDataEvent,
  GitDiffFile,
  GitOverview
} from '../shared/ipc'
import { PtyManager } from './pty-manager'
import { CwdTracker } from './cwd-tracker'
import { GitService } from './git-service'
import { HookServer } from './hook-server'
import { HookInstaller } from './hook-installer'
import { Notifier } from './notifier'

let mainWindow: BrowserWindow | null = null

const socketPath = path.join(app.getPath('userData'), 'hook.sock')
const ptyManager = new PtyManager(() => mainWindow?.webContents ?? null, socketPath)
const cwdTracker = new CwdTracker(ptyManager, () => mainWindow?.webContents ?? null)
const gitService = new GitService()
const notifier = new Notifier(() => mainWindow)
const hookServer = new HookServer(socketPath, (event) => notifier.handleHookEvent(event))
const hookInstaller = new HookInstaller()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'petaterm',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.PtyCreate, (_e, req: PtyCreateRequest) => {
    ptyManager.create(req.tabId, req.cwd)
  })
  ipcMain.on(IPC.PtyWrite, (_e, payload: PtyDataEvent) => {
    ptyManager.write(payload.tabId, payload.data)
  })
  ipcMain.on(IPC.PtyResize, (_e, payload: { tabId: string; cols: number; rows: number }) => {
    ptyManager.resize(payload.tabId, payload.cols, payload.rows)
  })
  ipcMain.on(IPC.PtyDispose, (_e, payload: { tabId: string }) => {
    ptyManager.dispose(payload.tabId)
  })

  ipcMain.handle(IPC.GitOverview, (_e, cwd: string): Promise<GitOverview> => {
    return gitService.overview(cwd)
  })
  ipcMain.handle(IPC.GitCheckout, (_e, cwd: string, branch: string): Promise<GitResult> => {
    return gitService.checkout(cwd, branch)
  })
  ipcMain.handle(IPC.GitCreateBranch, (_e, cwd: string, branch: string): Promise<GitResult> => {
    return gitService.createBranch(cwd, branch)
  })
  ipcMain.handle(IPC.GitDiff, (_e, cwd: string): Promise<GitDiffFile[]> => {
    return gitService.diff(cwd)
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  hookServer.start()
  cwdTracker.start()
  createWindow()

  if (mainWindow) {
    void hookInstaller.promptAndInstall(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  cwdTracker.stop()
  ptyManager.disposeAll()
  hookServer.stop()
})
