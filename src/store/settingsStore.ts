import { create } from 'zustand'
import type { Settings, ProviderName } from '@/types'
import { formatError } from '@/lib/errors'
import { useUIStore } from './uiStore'

interface SettingsState {
  settings: Settings | null
  isLoading: boolean
  error: string | null

  loadSettings: () => Promise<void>
  saveSettings: (settings: Settings) => Promise<void>
  updateProvider: (name: ProviderName, partial: Partial<Settings['providers'][ProviderName]>) => Promise<void>
  setActiveProvider: (name: ProviderName) => Promise<void>
  setStrictMode: (enabled: boolean) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
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

      // Apply last workspace path to UI store — validate it still exists
      if (settings.lastWorkspacePath) {
        try {
          await window.redLedger.listFiles()
          useUIStore.getState().setWorkspacePath(settings.lastWorkspacePath)
        } catch {
          useUIStore.getState().setWorkspacePath(null)
          useUIStore.getState().addToast({
            type: 'warning',
            message: `Previous workspace no longer exists: ${settings.lastWorkspacePath}`
          })
        }
      }
    } catch (err) {
      const message = formatError(err)
      set({ isLoading: false, error: message })
    }
  },

  saveSettings: async (settings) => {
    if (!window.redLedger) return
    try {
      await window.redLedger.saveSettings(settings)
      set({ settings })
    } catch (err) {
      useUIStore.getState().addToast({
        type: 'error',
        message: formatError(err)
      })
    }
  },

  updateProvider: async (name, partial) => {
    const { settings, saveSettings } = get()
    if (!settings) return

    const updated: Settings = {
      ...settings,
      providers: {
        ...settings.providers,
        [name]: { ...settings.providers[name], ...partial }
      }
    }
    await saveSettings(updated)
  },

  setActiveProvider: async (name) => {
    const { settings, saveSettings } = get()
    if (!settings) return

    await saveSettings({ ...settings, activeProvider: name })
  },

  setStrictMode: async (enabled) => {
    const { settings, saveSettings } = get()
    if (!settings) return

    await saveSettings({ ...settings, strictMode: enabled })
  }
}))
