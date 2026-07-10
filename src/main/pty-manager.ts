import * as pty from 'node-pty'
import os from 'node:os'
import { WebContents } from 'electron'
import { IPC, PtyDataEvent, PtyExitEvent } from '../shared/ipc'

interface PtySession {
  tabId: string
  proc: pty.IPty
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()

  constructor(
    private getWebContents: () => WebContents | null,
    private socketPath: string
  ) {}

  create(tabId: string, cwd?: string): void {
    if (this.sessions.has(tabId)) return
    const shell = process.env.SHELL || '/bin/bash'
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: {
        ...(process.env as Record<string, string>),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PETATERM_TAB_ID: tabId,
        PETATERM_SOCKET: this.socketPath
      }
    })

    proc.onData((data) => {
      const payload: PtyDataEvent = { tabId, data }
      this.getWebContents()?.send(IPC.PtyData, payload)
    })

    proc.onExit(({ exitCode }) => {
      this.sessions.delete(tabId)
      const payload: PtyExitEvent = { tabId, exitCode }
      this.getWebContents()?.send(IPC.PtyExit, payload)
    })

    this.sessions.set(tabId, { tabId, proc })
  }

  write(tabId: string, data: string): void {
    this.sessions.get(tabId)?.proc.write(data)
  }

  resize(tabId: string, cols: number, rows: number): void {
    if (cols < 2 || rows < 2) return
    try {
      this.sessions.get(tabId)?.proc.resize(cols, rows)
    } catch {
      // resize can race with process exit
    }
  }

  dispose(tabId: string): void {
    const session = this.sessions.get(tabId)
    if (!session) return
    this.sessions.delete(tabId)
    session.proc.kill()
  }

  disposeAll(): void {
    for (const tabId of [...this.sessions.keys()]) this.dispose(tabId)
  }

  pids(): Map<string, number> {
    const result = new Map<string, number>()
    for (const [tabId, session] of this.sessions) result.set(tabId, session.proc.pid)
    return result
  }
}
