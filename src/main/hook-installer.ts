import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'

const HOOK_MARKER = 'petaterm-hook.js'

interface HookCommand {
  type: 'command'
  command: string
}

interface HookMatcherEntry {
  matcher?: string
  hooks: HookCommand[]
}

/**
 * Installs the petaterm hook forwarder into ~/.claude/settings.json so that
 * Claude Code notifies petaterm on permission prompts, idle prompts and
 * turn completion (Stop).
 */
export class HookInstaller {
  private settingsPath = path.join(os.homedir(), '.claude', 'settings.json')

  hookScriptPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'petaterm-hook.js')
      : path.join(app.getAppPath(), 'resources', 'petaterm-hook.js')
  }

  isInstalled(): boolean {
    try {
      const raw = fs.readFileSync(this.settingsPath, 'utf8')
      return raw.includes(HOOK_MARKER)
    } catch {
      return false
    }
  }

  async promptAndInstall(win: BrowserWindow): Promise<void> {
    if (this.isInstalled()) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['セットアップする', 'あとで'],
      defaultId: 0,
      cancelId: 1,
      title: 'Claude Code 連携',
      message: 'Claude Code 連携をセットアップしますか?',
      detail:
        '~/.claude/settings.json に hooks を登録し、Claude Code の権限リクエストや応答完了をタブに表示できるようにします。petaterm 以外で起動した Claude Code には影響しません。'
    })
    if (response === 0) {
      try {
        this.install()
      } catch (e) {
        dialog.showErrorBox(
          'hooks の登録に失敗しました',
          e instanceof Error ? e.message : String(e)
        )
      }
    }
  }

  install(): void {
    const command = `node "${this.hookScriptPath()}"`

    let settings: Record<string, unknown> = {}
    if (fs.existsSync(this.settingsPath)) {
      const raw = fs.readFileSync(this.settingsPath, 'utf8')
      settings = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {}
      fs.writeFileSync(this.settingsPath + '.petaterm.bak', raw)
    } else {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true })
    }

    const hooks = (settings.hooks ?? {}) as Record<string, HookMatcherEntry[]>
    settings.hooks = hooks

    this.ensureEntry(hooks, 'Notification', 'permission_prompt', command)
    this.ensureEntry(hooks, 'Notification', 'idle_prompt', command)
    this.ensureEntry(hooks, 'Stop', undefined, command)

    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + '\n')
  }

  private ensureEntry(
    hooks: Record<string, HookMatcherEntry[]>,
    event: string,
    matcher: string | undefined,
    command: string
  ): void {
    if (!Array.isArray(hooks[event])) hooks[event] = []
    const entries = hooks[event]
    const existing = entries.find(
      (e) => (e.matcher ?? undefined) === matcher && e.hooks?.some((h) => h.command?.includes(HOOK_MARKER))
    )
    if (existing) {
      // refresh the command path (e.g. app was moved)
      for (const h of existing.hooks) {
        if (h.command?.includes(HOOK_MARKER)) h.command = command
      }
      return
    }
    const entry: HookMatcherEntry = { hooks: [{ type: 'command', command }] }
    if (matcher !== undefined) entry.matcher = matcher
    entries.push(entry)
  }
}
