import { useEffect, useState } from 'react'
import {
  ACTIONS,
  ACTION_LABELS,
  formatBinding,
  normalizeKey,
  ShortcutAction,
  useKeybindingsStore
} from '../stores/keybindings'
import {
  FONT_FAMILIES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  THEMES,
  useAppearanceStore
} from '../stores/appearance'

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta']

type Section = 'appearance' | 'shortcuts'

interface SettingsProps {
  onClose: () => void
}

export function Settings({ onClose }: SettingsProps): React.JSX.Element {
  const [section, setSection] = useState<Section>('appearance')
  const setCapturing = useKeybindingsStore((s) => s.setCapturing)

  // Escape closes the dialog when not mid-capture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useKeybindingsStore.getState().capturing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const close = (): void => {
    setCapturing(null)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">設定</span>
          <button className="icon-button" onClick={close} title="閉じる">
            ×
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            <button
              className={`settings-nav-item${section === 'appearance' ? ' active' : ''}`}
              onClick={() => setSection('appearance')}
            >
              外観
            </button>
            <button
              className={`settings-nav-item${section === 'shortcuts' ? ' active' : ''}`}
              onClick={() => setSection('shortcuts')}
            >
              ショートカット
            </button>
          </nav>
          <div className="settings-content">
            {section === 'appearance' ? <AppearanceSettings /> : <ShortcutSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppearanceSettings(): React.JSX.Element {
  const themeKey = useAppearanceStore((s) => s.themeKey)
  const fontFamily = useAppearanceStore((s) => s.fontFamily)
  const fontSize = useAppearanceStore((s) => s.fontSize)
  const setTheme = useAppearanceStore((s) => s.setTheme)
  const setFontFamily = useAppearanceStore((s) => s.setFontFamily)
  const setFontSize = useAppearanceStore((s) => s.setFontSize)

  return (
    <div className="appearance-settings">
      <div className="setting-group">
        <span className="setting-label">カラースキーム</span>
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.key}
              className={`theme-card${themeKey === theme.key ? ' active' : ''}`}
              onClick={() => setTheme(theme.key)}
              title={theme.name}
              style={{ background: theme.terminal.background, color: theme.terminal.foreground }}
            >
              <span className="theme-swatches">
                <span style={{ background: theme.terminal.red }} />
                <span style={{ background: theme.terminal.green }} />
                <span style={{ background: theme.terminal.blue }} />
                <span style={{ background: theme.ui.accent }} />
              </span>
              <span className="theme-name">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <span className="setting-label">フォント</span>
        <select
          className="setting-input"
          value={FONT_FAMILIES.includes(fontFamily) ? fontFamily : ''}
          onChange={(e) => setFontFamily(e.target.value)}
        >
          {!FONT_FAMILIES.includes(fontFamily) && <option value="">{fontFamily}（カスタム）</option>}
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-group">
        <span className="setting-label">フォントサイズ</span>
        <div className="font-size-row">
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <input
            type="number"
            className="setting-input font-size-input"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
          <span className="font-size-unit">px</span>
        </div>
      </div>
    </div>
  )
}

function ShortcutSettings(): React.JSX.Element {
  const bindings = useKeybindingsStore((s) => s.bindings)
  const capturing = useKeybindingsStore((s) => s.capturing)
  const setBinding = useKeybindingsStore((s) => s.setBinding)
  const resetBinding = useKeybindingsStore((s) => s.resetBinding)
  const setCapturing = useKeybindingsStore((s) => s.setCapturing)

  // While capturing, grab the next key combo (capture phase so it preempts the
  // global shortcut handler and xterm). A lone modifier is ignored; Escape aborts.
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (MODIFIER_KEYS.includes(e.key)) return
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      setBinding(capturing, {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
        key: normalizeKey(e.key)
      })
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, setBinding, setCapturing])

  // Detect duplicate combos so the user can spot conflicts.
  const seen = new Map<string, number>()
  for (const a of ACTIONS) {
    const k = formatBinding(bindings[a])
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }

  return (
    <div className="shortcut-settings">
      {ACTIONS.map((action: ShortcutAction) => {
        const combo = formatBinding(bindings[action])
        const conflict = (seen.get(combo) ?? 0) > 1
        return (
          <div className="keybind-row" key={action}>
            <span className="keybind-label">{ACTION_LABELS[action]}</span>
            <button
              className={[
                'keybind-combo',
                capturing === action ? 'capturing' : '',
                conflict ? 'conflict' : ''
              ].join(' ')}
              onClick={() => setCapturing(capturing === action ? null : action)}
              title={conflict ? '他の操作と重複しています' : 'クリックして新しいキーを押す'}
            >
              {capturing === action ? 'キーを押す…' : combo}
            </button>
            <button
              className="keybind-reset"
              onClick={() => resetBinding(action)}
              title="デフォルトに戻す"
            >
              ↺
            </button>
          </div>
        )
      })}
      <div className="settings-hint">
        割り当てるにはキー欄をクリックして希望のキーを押してください（Esc で中止）。
      </div>
    </div>
  )
}
