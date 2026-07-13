import path from 'node:path'
import { WebContents } from 'electron'
import { IPC, TabProcessEvent } from '../shared/ipc'
import { defaultShell, PtyManager } from './pty-manager'

/**
 * Polls each pty's foreground process name (node-pty's `process` getter:
 * tcgetpgrp + /proc/<pgrp>/cmdline) so tabs can show what is running. The
 * shell sitting at its prompt is reported as null — "nothing running".
 */
export class ProcessTracker {
  private cache = new Map<string, string | null>()
  private timer: NodeJS.Timeout | null = null
  private shellName = path.basename(defaultShell())

  constructor(
    private ptyManager: PtyManager,
    private getWebContents: () => WebContents | null
  ) {}

  start(intervalMs = 1500): void {
    this.timer = setInterval(() => this.poll(), intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private poll(): void {
    for (const [tabId, raw] of this.ptyManager.foregroundProcesses()) {
      // argv[0] may be a full path ("/usr/bin/vim").
      const name = path.basename(raw)
      const proc = name === '' || name === this.shellName ? null : name
      if (this.cache.has(tabId) && this.cache.get(tabId) === proc) continue
      this.cache.set(tabId, proc)
      const payload: TabProcessEvent = { tabId, process: proc }
      this.getWebContents()?.send(IPC.TabProcess, payload)
    }
  }
}
