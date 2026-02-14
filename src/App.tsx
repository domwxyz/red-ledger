import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { Toaster } from './components/ui/Toast'
import { useSettingsStore, useUIStore } from './store'
import { notify } from './lib/notify'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const settings = useSettingsStore((s) => s.settings)
  const activeTheme = settings?.darkMode ? 'red-ledger-dark' : 'red-ledger'

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // After settings load, validate and restore the last workspace path
  useEffect(() => {
    if (!settings?.lastWorkspacePath) return

    const validateWorkspace = async () => {
      try {
        await window.redLedger.listFiles()
        useUIStore.getState().setWorkspacePath(settings.lastWorkspacePath)
      } catch {
        useUIStore.getState().setWorkspacePath(null)
        const latestSettings = useSettingsStore.getState().settings
        if (latestSettings) {
          useSettingsStore.getState().saveSettings({
            ...latestSettings,
            lastWorkspacePath: null
          })
        }
        notify({
          type: 'warning',
          message: `Previous workspace no longer exists: ${settings.lastWorkspacePath}`
        })
      }
    }

    validateWorkspace()
  }, [settings?.lastWorkspacePath])

  return (
    <div className="h-full w-full" data-theme={activeTheme}>
      <Layout />
      <Toaster />
    </div>
  )
}
