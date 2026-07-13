import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  FsAppInfo,
  FsEntry,
  FsListResult,
  FsOpenResult,
  GitResult,
  HotkeyRegisterResult,
  IPC,
  PtyCreateRequest,
  PtyDataEvent,
  GitDiffFile,
  GitLogEntry,
  GitOverview
} from '../shared/ipc'
import { PtyManager } from './pty-manager'
import { CwdTracker } from './cwd-tracker'
import { GitService } from './git-service'
import { AppCandidate, launchWith, listAllApps, listAppsFor, listMimeTypes, mimeTypesFor } from './open-with'
import { cleanupStaleHookSockets, HookServer } from './hook-server'
import { HookInstaller } from './hook-installer'
import { Notifier } from './notifier'
import appIcon from '../../resources/icon.png?asset'

let mainWindow: BrowserWindow | null = null

// In dev, keep settings/session/localStorage/hook socket separate from the
// installed app so dev runs never clobber the real config. Must run before
// anything reads userData (e.g. the socket path below).
if (!app.isPackaged) {
  app.setPath('userData', app.getPath('userData') + '-dev')
}

// Per-instance socket so concurrent petaterm processes (e.g. a dev run next
// to the daily instance) never steal each other's hook events. The path
// reaches Claude Code through each pty's env ($PETATERM_SOCKET), so no global
// registration depends on it.
const socketPath = path.join(app.getPath('userData'), `hook-${process.pid}.sock`)
const ptyManager = new PtyManager(() => mainWindow?.webContents ?? null, socketPath)
const cwdTracker = new CwdTracker(ptyManager, () => mainWindow?.webContents ?? null)
const gitService = new GitService()
// Desktop notifications are titled with the repo (or directory) the tab's
// Claude Code session runs in, so multiple sessions stay distinguishable.
const notifier = new Notifier(
  () => mainWindow,
  async (tabId) => {
    const cwd = cwdTracker.getCwd(tabId)
    if (!cwd) return null
    const root = await gitService.repoRoot(cwd)
    return path.basename(root ?? cwd)
  }
)
const hookServer = new HookServer(socketPath, (event) => notifier.handleHookEvent(event))
const hookInstaller = new HookInstaller()

// The global summon hotkey (default F12, overridden by the renderer's
// keybindings store via IPC once it loads). Quake-style toggle: summon the
// window from anywhere, minimize it when it's already focused.
let hotkeyAccelerator: string | null = null

function toggleWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isFocused()) {
    mainWindow.minimize()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function registerHotkey(accelerator: string | null): HotkeyRegisterResult {
  if (hotkeyAccelerator) {
    globalShortcut.unregister(hotkeyAccelerator)
    hotkeyAccelerator = null
  }
  if (!accelerator) return { ok: true }
  try {
    // register returns false when another app already grabs the key.
    if (!globalShortcut.register(accelerator, toggleWindow)) {
      return { ok: false, error: `${accelerator} を登録できません(他のアプリが使用中の可能性)` }
    }
  } catch (error) {
    // Thrown for strings that aren't valid accelerators (e.g. IME keys).
    return { ok: false, error: String(error) }
  }
  hotkeyAccelerator = accelerator
  return { ok: true }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'petaterm',
    icon: appIcon,
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

  ipcMain.handle(IPC.HotkeySet, (_e, accelerator: string | null) => registerHotkey(accelerator))

  // Directory listing for the files panel.
  ipcMain.handle(IPC.FsList, async (_e, dir: string): Promise<FsListResult> => {
    try {
      const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
      const entries: FsEntry[] = await Promise.all(
        dirents.map(async (d) => {
          try {
            // stat (not lstat) so symlinks report their target's type/size.
            const st = await fs.promises.stat(path.join(dir, d.name))
            return {
              name: d.name,
              isDir: st.isDirectory(),
              size: st.isDirectory() ? null : st.size,
              mtime: st.mtimeMs
            }
          } catch {
            // broken symlink etc. — keep the entry visible
            return { name: d.name, isDir: d.isDirectory(), size: null, mtime: null }
          }
        })
      )
      return { ok: true, entries }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // Open a file (or directory) with the OS default application.
  ipcMain.handle(IPC.FsOpen, async (_e, target: string): Promise<FsOpenResult> => {
    const error = await shell.openPath(target)
    return error ? { ok: false, error } : { ok: true }
  })

  // Open a file with a specific application (the per-extension opener the
  // user configured in settings).
  ipcMain.handle(IPC.FsOpenWith, (_e, desktopFile: string, target: string): FsOpenResult => {
    // The app may have been uninstalled since it was configured.
    if (!fs.existsSync(desktopFile)) {
      return { ok: false, error: `アプリが見つかりません: ${path.basename(desktopFile)}` }
    }
    launchWith(desktopFile, target)
    return { ok: true }
  })

  // The file's MIME type chain (specific → generic), for the renderer's
  // MIME-pattern openers. Empty when xdg-mime is unavailable or stumped.
  ipcMain.handle(IPC.FsMime, async (_e, target: string): Promise<string[]> => {
    try {
      return await mimeTypesFor(target)
    } catch {
      return []
    }
  })

  // Known MIME types (+ per-media-type wildcards), for the settings UI's
  // pattern completion.
  ipcMain.handle(IPC.FsListMimeTypes, (): string[] => listMimeTypes())

  // Installed applications, for the extension→app settings UI.
  ipcMain.handle(IPC.FsListApps, (): FsAppInfo[] =>
    listAllApps(app.getLocale()).map(({ name, desktopFile }) => ({ name, desktopFile }))
  )

  // Right-click menu for a files-panel entry: default open, open-with app
  // list (from the target's MIME type), reveal in file manager. openerFile
  // is the configured per-extension opener; it takes over the default open.
  ipcMain.handle(IPC.FsContextMenu, async (e, target: string, x: number, y: number, openerFile?: string): Promise<void> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? mainWindow
    if (!win) return
    const locale = app.getLocale()
    let apps: AppCandidate[] = []
    try {
      apps = await listAppsFor(target, locale)
    } catch {
      // xdg-mime/gio unavailable — the submenu just shows the all-apps list
    }
    const appItem = (a: AppCandidate): Electron.MenuItemConstructorOptions => ({
      label: a.name,
      // Menus render icons at their natural size, so downscale explicitly.
      icon: a.icon ? nativeImage.createFromPath(a.icon).resize({ width: 16, height: 16 }) : undefined,
      click: (): void => launchWith(a.desktopFile, target)
    })
    const menu = Menu.buildFromTemplate([
      {
        label: '開く',
        click: (): void => {
          if (openerFile && fs.existsSync(openerFile)) launchWith(openerFile, target)
          else void shell.openPath(target)
        }
      },
      {
        label: 'アプリケーションで開く',
        submenu: [
          ...apps.map(appItem),
          ...(apps.length ? [{ type: 'separator' as const }] : []),
          { label: 'すべてのアプリケーション', submenu: listAllApps(locale).map(appItem) }
        ]
      },
      { type: 'separator' },
      { label: 'ファイルマネージャーで表示', click: () => shell.showItemInFolder(target) }
    ])
    // Anchor to the clicked row (the OS cursor can be elsewhere, e.g. when
    // the menu is triggered synthetically or via keyboard).
    menu.popup({ window: win, x: Math.round(x), y: Math.round(y) })
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
  ipcMain.handle(IPC.GitLog, (_e, cwd: string): Promise<GitLogEntry[]> => {
    return gitService.log(cwd)
  })
  ipcMain.handle(IPC.GitCommit, (_e, cwd: string, message: string): Promise<GitResult> => {
    return gitService.commit(cwd, message)
  })
  ipcMain.handle(IPC.GitUndoCommit, (_e, cwd: string): Promise<GitResult> => {
    return gitService.undoLastCommit(cwd)
  })
  ipcMain.handle(IPC.GitRevert, (_e, cwd: string, hash: string): Promise<GitResult> => {
    return gitService.revert(cwd, hash)
  })
}

app.whenReady().then(() => {
  // No application menu bar — petaterm drives everything from its own UI.
  Menu.setApplicationMenu(null)
  registerIpcHandlers()
  cleanupStaleHookSockets(app.getPath('userData'))
  hookServer.start()
  cwdTracker.start()
  createWindow()
  // Provisional default; the renderer re-registers with the saved binding on load.
  registerHotkey('F12')

  if (mainWindow) {
    void hookInstaller.promptAndInstall(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Focusing the window acknowledges the pending desktop notifications: they
  // leave the OS notification list, which also clears the dock's unread badge.
  app.on('browser-window-focus', () => notifier.closeAll())
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  cwdTracker.stop()
  ptyManager.disposeAll()
  hookServer.stop()
})
