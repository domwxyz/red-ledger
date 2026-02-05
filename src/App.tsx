import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { Toaster } from './components/ui/Toast'
import { useSettingsStore } from './store'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings)

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return (
    <div className="h-full w-full" data-theme="red-ledger">
      <Layout />
      <Toaster />
    </div>
  )
}
