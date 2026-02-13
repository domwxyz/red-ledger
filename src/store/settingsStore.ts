import { create } from 'zustand'
import type { Settings } from '@/types'
import { formatError } from '@/lib/errors'
import { notify } from '@/lib/notify'

const SAVE_DEBOUNCE_MS = 500

interface SettingsState {
  settings: Settings | null
  isLoading: boolean
  error: string | null

  loadSettings: () => Promise<void>
  saveSettings: (settings: Settings) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Persist settings to disk with debouncing.
 * Updates local state immediately for snappy UI, but batches IPC writes
 * so rapid changes (e.g. dragging the temperature slider) don't spam disk I/O.
 */
function debouncedPersist(settings: Settings) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    saveTimer = null
    if (!window.redLedger) return
    try {
      await window.redLedger.saveSettings(settings)
    } catch (err) {
      notify({ type: 'error', message: formatError(err) })
    }
  }, SAVE_DEBOUNCE_MS)
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  loadSettings: async () => {
    if (!window.redLedger) {
      set({ isLoading: false, error: 'API not available' })
      return
    }
    set({ isLoading: true, error: null })
    try {
      const settings = await window.redLedger.loadSettings()
      set({ settings, isLoading: false })
    } catch (err) {
      const message = formatError(err)
      set({ isLoading: false, error: message })
    }
  },

  saveSettings: (settings) => {
    // Optimistic local update (instant UI feedback)
    set({ settings })
    // Debounced disk write
    debouncedPersist(settings)
  }
}))
