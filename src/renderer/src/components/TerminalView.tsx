import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { Tab, useTabsStore } from '../stores/tabs'

interface TerminalViewProps {
  tab: Tab
  active: boolean
}

export function TerminalView({ tab, active }: TerminalViewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const container = containerRef.current!
    const term = new Terminal({
      fontFamily: 'monospace',
      fontSize: 14,
      scrollback: 10000,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b70'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // WebGL unavailable — fall back to the DOM renderer
    }
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // Let app-level shortcuts win over the shell while the terminal is focused.
    term.attachCustomKeyEventHandler((e) => {
      if (
        e.type === 'keydown' &&
        e.ctrlKey &&
        e.shiftKey &&
        ['T', 'W', 'G', 'PageUp', 'PageDown'].includes(e.key)
      ) {
        return false
      }
      return true
    })

    // Subscribe before creating the pty so the first prompt is never dropped.
    const unsubData = window.petaterm.onPtyData(({ tabId, data }) => {
      if (tabId === tab.id) term.write(data)
    })
    const unsubExit = window.petaterm.onPtyExit(({ tabId, exitCode }) => {
      if (tabId === tab.id) term.write(`\r\n[プロセスが終了しました (code ${exitCode})]\r\n`)
    })
    // Seed the shell in the cwd inherited from the spawning tab (empty → home).
    void window.petaterm.ptyCreate(tab.id, tab.cwd || undefined).then(() => {
      window.petaterm.ptyResize(tab.id, term.cols, term.rows)
    })

    term.onData((data) => {
      // Typing into the tab acknowledges its badge.
      useTabsStore.getState().clearActivity(tab.id)
      window.petaterm.ptyWrite(tab.id, data)
    })
    term.onResize(({ cols, rows }) => {
      window.petaterm.ptyResize(tab.id, cols, rows)
    })

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit()
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      unsubData()
      unsubExit()
      window.petaterm.ptyDispose(tab.id)
      term.dispose()
    }
    // The terminal and pty live for the lifetime of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      termRef.current?.focus()
    }
  }, [active])

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}
