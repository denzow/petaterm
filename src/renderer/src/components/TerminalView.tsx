import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { Tab, useTabsStore } from '../stores/tabs'
import { useKeybindingsStore } from '../stores/keybindings'
import { resolveFontFamily, useAppearanceStore } from '../stores/appearance'

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
    const appearance = useAppearanceStore.getState()
    const term = new Terminal({
      fontFamily: resolveFontFamily(appearance.fontFamily),
      fontSize: appearance.fontSize,
      scrollback: 10000,
      cursorBlink: true,
      allowProposedApi: true,
      theme: appearance.currentTheme().terminal
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

    // Let app-level shortcuts win over the shell while the terminal is focused:
    // any combo bound to an action is handed back to the window handler.
    // copy/paste need this terminal instance, so they are handled right here.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const action = useKeybindingsStore.getState().actionFor(e)
      if (!action) return true
      if (action === 'copy') {
        const selection = term.getSelection()
        if (selection) void navigator.clipboard.writeText(selection)
        e.preventDefault()
        return false
      }
      if (action === 'paste') {
        void navigator.clipboard.readText().then((text) => {
          if (text) term.paste(text)
        })
        // Suppress the browser's own paste so the text isn't inserted twice.
        e.preventDefault()
        return false
      }
      // Panel switching only applies under a repo; otherwise let the shell
      // handle the key (e.g. Ctrl+←/→ word movement).
      if (
        (action === 'panelLeft' || action === 'panelRight') &&
        !useTabsStore.getState().activeRepo
      ) {
        return true
      }
      return false
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
      window.petaterm.ptyWrite(tab.id, data)
    })
    term.onResize(({ cols, rows }) => {
      window.petaterm.ptyResize(tab.id, cols, rows)
    })

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit()
    })
    resizeObserver.observe(container)

    // Apply live theme / font changes to this terminal.
    const unsubAppearance = useAppearanceStore.subscribe((s) => {
      term.options.theme = s.currentTheme().terminal
      term.options.fontFamily = resolveFontFamily(s.fontFamily)
      term.options.fontSize = s.fontSize
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fit.fit()
        window.petaterm.ptyResize(tab.id, term.cols, term.rows)
      }
    })

    return () => {
      resizeObserver.disconnect()
      unsubData()
      unsubExit()
      unsubAppearance()
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
