import { BrowserWindow, Notification } from 'electron'
import {
  AppNotificationEvent,
  AppNotificationKind,
  IPC,
  TabActivityEvent,
  TabActivityState
} from '../shared/ipc'
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
    const { state, title, kind } = mapped

    const win = this.getWindow()
    const payload: TabActivityEvent = {
      tabId: event.tabId,
      state,
      message: event.message ?? ''
    }
    win?.webContents.send(IPC.TabActivity, payload)

    if (!title || !kind) return
    // The desktop popup is suppressed while the window is focused (permission
    // requests always pop up); the in-app notifications panel records every
    // occurrence regardless.
    const focused = win?.isFocused() ?? false
    const showDesktop = (state === 'permission' || !focused) && Notification.isSupported()
    void this.dispatch(event, title, kind, showDesktop)
  }

  private async dispatch(
    event: HookEvent,
    title: string,
    kind: AppNotificationKind,
    showDesktop: boolean
  ): Promise<void> {
    const source = await this.getSourceName(event.tabId).catch(() => null)

    const payload: AppNotificationEvent = {
      tabId: event.tabId,
      kind,
      title,
      message: event.message ?? '',
      source,
      timestamp: Date.now()
    }
    this.getWindow()?.webContents.send(IPC.AppNotification, payload)

    if (!showDesktop) return
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
  ): { state: TabActivityState | null; title?: string; kind?: AppNotificationKind } | null {
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
          return {
            state: 'permission',
            title: 'Claude Code が許可を求めています',
            kind: 'permission'
          }
        }
        if (event.notificationType === 'idle_prompt') {
          return { state: 'idle', title: 'Claude Code が入力を待っています', kind: 'idle' }
        }
        return null
      case 'Stop':
        return { state: 'idle', title: 'Claude Code の応答が完了しました', kind: 'stop' }
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
