import { BrowserWindow, Notification } from 'electron'
import { IPC, TabActivityEvent, TabActivityState } from '../shared/ipc'
import { HookEvent } from './hook-server'

/**
 * Maps Claude Code hook events to tab status states, forwards them to the
 * renderer (status icon) and raises desktop notifications. The icon tracks
 * the session's lifecycle: it appears on SessionStart, follows the
 * running / permission / idle transitions, and only disappears on SessionEnd.
 */
export class Notifier {
  constructor(
    private getWindow: () => BrowserWindow | null,
    /** Repo (or cwd) name identifying where the tab's session runs. */
    private getSourceName: (tabId: string) => Promise<string | null>
  ) {}

  handleHookEvent(event: HookEvent): void {
    const mapped = this.mapState(event)
    if (!mapped) return
    const { state, title } = mapped

    const win = this.getWindow()
    const payload: TabActivityEvent = {
      tabId: event.tabId,
      state,
      message: event.message ?? ''
    }
    win?.webContents.send(IPC.TabActivity, payload)

    if (!title) return
    const focused = win?.isFocused() ?? false
    const shouldNotify = state === 'permission' || !focused
    if (shouldNotify && Notification.isSupported()) {
      void this.notify(event, title)
    }
  }

  private async notify(event: HookEvent, title: string): Promise<void> {
    const source = await this.getSourceName(event.tabId).catch(() => null)
    const notification = new Notification({
      title: source ? `[${source}] ${title}` : title,
      body: truncate(event.message ?? '', 120)
    })
    notification.on('click', () => {
      const w = this.getWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    })
    notification.show()
  }

  private mapState(
    event: HookEvent
  ): { state: TabActivityState | null; title?: string } | null {
    switch (event.hookEventName) {
      case 'SessionStart':
        // Claude Code launched — waiting for the first prompt.
        return { state: 'idle' }
      case 'UserPromptSubmit':
        return { state: 'running' }
      case 'PreToolUse':
        // Also flips 'permission' back to 'running' once a tool is approved.
        return { state: 'running' }
      case 'Notification':
        if (event.notificationType === 'permission_prompt') {
          return { state: 'permission', title: 'Claude Code が許可を求めています' }
        }
        if (event.notificationType === 'idle_prompt') {
          return { state: 'idle', title: 'Claude Code が入力を待っています' }
        }
        return null
      case 'Stop':
        return { state: 'idle', title: 'Claude Code の応答が完了しました' }
      case 'SessionEnd':
        return { state: null }
      default:
        return null
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
