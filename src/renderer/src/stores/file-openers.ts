import { create } from 'zustand'
import type { FsOpenResult } from '../../../shared/ipc'

// Per-extension file openers: the files panel opens a matching file with the
// configured application instead of the OS default. Extensions with no entry
// keep the OS behavior (shell.openPath). Persisted to localStorage.

export interface FileOpener {
  /** Normalized: lowercase, no leading dot. May be compound ("tar.gz"). */
  ext: string
  /** Application display name, kept for the settings UI. */
  appName: string
  /** Absolute path to the application's .desktop file ('' while unset). */
  desktopFile: string
}

const STORAGE_KEY = 'petaterm.fileOpeners'

/** "*.PNG" / ".png" / "png" all become "png". */
export function normalizeExt(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[*.]+/, '')
}

/**
 * The configured opener for a file, or null to use the OS default. Compound
 * extensions win over their tails ("tar.gz" over "gz") via longest match.
 */
export function openerFor(fileName: string, openers: FileOpener[]): FileOpener | null {
  const name = fileName.toLowerCase()
  let best: FileOpener | null = null
  for (const o of openers) {
    if (!o.ext || !o.desktopFile) continue
    if (!name.endsWith(`.${o.ext}`)) continue
    if (!best || o.ext.length > best.ext.length) best = o
  }
  return best
}

/**
 * Open a file honoring the configured openers: the matching app when the
 * extension has one, the OS default otherwise.
 */
export function openFile(path: string): Promise<FsOpenResult> {
  const opener = openerFor(path, useFileOpenersStore.getState().openers)
  return opener
    ? window.petaterm.fsOpenWith(opener.desktopFile, path)
    : window.petaterm.fsOpen(path)
}

function load(): FileOpener[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (o): o is FileOpener =>
        typeof o === 'object' &&
        o !== null &&
        typeof (o as FileOpener).ext === 'string' &&
        typeof (o as FileOpener).appName === 'string' &&
        typeof (o as FileOpener).desktopFile === 'string'
    )
  } catch {
    return []
  }
}

function persist(openers: FileOpener[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(openers))
  } catch {
    // storage unavailable — keep in-memory values
  }
}

interface FileOpenersState {
  openers: FileOpener[]
  addOpener: () => void
  updateOpener: (index: number, patch: Partial<FileOpener>) => void
  removeOpener: (index: number) => void
}

export const useFileOpenersStore = create<FileOpenersState>((set) => ({
  openers: load(),

  addOpener: () => {
    set((s) => {
      const openers = [...s.openers, { ext: '', appName: '', desktopFile: '' }]
      persist(openers)
      return { openers }
    })
  },

  updateOpener: (index, patch) => {
    set((s) => {
      const openers = s.openers.map((o, i) =>
        i === index ? { ...o, ...patch, ...(patch.ext !== undefined ? { ext: normalizeExt(patch.ext) } : {}) } : o
      )
      persist(openers)
      return { openers }
    })
  },

  removeOpener: (index) => {
    set((s) => {
      const openers = s.openers.filter((_, i) => i !== index)
      persist(openers)
      return { openers }
    })
  }
}))
