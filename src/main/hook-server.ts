import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

export interface HookEvent {
  tabId: string
  hookEventName: string
  notificationType?: string
  message?: string
}

/**
 * Unix domain socket server that receives events from the petaterm-hook
 * script registered in Claude Code's hooks (Notification / Stop).
 */
export class HookServer {
  private server: net.Server | null = null

  constructor(
    public readonly socketPath: string,
    private onEvent: (event: HookEvent) => void
  ) {}

  start(): void {
    fs.mkdirSync(path.dirname(this.socketPath), { recursive: true })
    if (fs.existsSync(this.socketPath)) fs.unlinkSync(this.socketPath)

    this.server = net.createServer((conn) => {
      let buf = ''
      conn.on('data', (chunk) => {
        buf += chunk.toString('utf8')
      })
      conn.on('end', () => {
        for (const line of buf.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const parsed = JSON.parse(trimmed) as HookEvent
            if (parsed.tabId && parsed.hookEventName) this.onEvent(parsed)
          } catch {
            // ignore malformed payloads
          }
        }
      })
      conn.on('error', () => {})
    })
    this.server.on('error', (err) => {
      console.error('[petaterm] hook server error:', err)
    })
    this.server.listen(this.socketPath)
  }

  stop(): void {
    this.server?.close()
    this.server = null
    try {
      fs.unlinkSync(this.socketPath)
    } catch {
      // already gone
    }
  }
}
