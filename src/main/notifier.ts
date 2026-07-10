import { BrowserWindow, Notification } from 'electron'
import { IPC, TabActivityEvent, TabActivityState } from '../shared/ipc'
import { HookEvent } from './hook-server'

/**
 * Maps Claude Code hook events to tab activity states, forwards them to the
 * renderer (badge) and raises desktop notifications.
 */
export class Notifier {
  constructor(private getWindow: () => BrowserWindow | null) {}

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

    const focused = win?.isFocused() ?? false
    const shouldNotify = state === 'permission' || !focused
    if (shouldNotify && Notification.isSupported()) {
      const notification = new Notification({
        title,
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
  }

  private mapState(event: HookEvent): { state: TabActivityState; title: string } | null {
    if (event.hookEventName === 'Notification') {
      if (event.notificationType === 'permission_prompt') {
        return { state: 'permission', title: 'Claude Code が許可を求めています' }
      }
      if (event.notificationType === 'idle_prompt') {
        return { state: 'idle', title: 'Claude Code が入力を待っています' }
      }
      return null
    }
    if (event.hookEventName === 'Stop') {
      return { state: 'idle', title: 'Claude Code の応答が完了しました' }
    }
    return null
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
