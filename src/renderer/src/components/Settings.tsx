import { useEffect } from 'react'
import {
  ACTIONS,
  ACTION_LABELS,
  formatBinding,
  normalizeKey,
  ShortcutAction,
  useKeybindingsStore
} from '../stores/keybindings'

const MODIFIER_KEYS = ['Control', 'Shift', 'Alt', 'Meta']

interface SettingsProps {
  onClose: () => void
}

export function Settings({ onClose }: SettingsProps): React.JSX.Element {
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

  // Escape closes the dialog when not mid-capture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useKeybindingsStore.getState().capturing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Detect duplicate combos so the user can spot conflicts.
  const seen = new Map<string, number>()
  for (const a of ACTIONS) {
    const k = formatBinding(bindings[a])
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }

  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        setCapturing(null)
        onClose()
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">キーボードショートカット</span>
          <button className="icon-button" onClick={onClose} title="閉じる">
            ×
          </button>
        </div>
        <div className="modal-body">
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
        </div>
        <div className="modal-footer">
          <span className="modal-hint">
            割り当てるにはキー欄をクリックして希望のキーを押してください（Esc で中止）。
          </span>
        </div>
      </div>
    </div>
  )
}
