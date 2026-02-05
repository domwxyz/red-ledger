import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/store'
import type { ProviderName } from '@/types'

const PROVIDERS: { id: ProviderName; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Ollama' }
]

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings)
  const isLoading = useSettingsStore((s) => s.isLoading)
  const error = useSettingsStore((s) => s.error)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsFetchFailed, setModelsFetchFailed] = useState(false)

  // Fetch models when the active provider changes
  useEffect(() => {
    if (!settings || !window.redLedger) return

    setModels([])
    setModelsFetchFailed(false)
    setModelsLoading(true)

    window.redLedger
      .listModels(settings.activeProvider)
      .then((list) => {
        setModels(list)
        setModelsFetchFailed(false)
      })
      .catch(() => {
        setModelsFetchFailed(true)
      })
      .finally(() => setModelsLoading(false))
  }, [settings?.activeProvider])

  if (!settings) {
    return (
      <div className="p-4 text-sm text-soft-charcoal/50 space-y-2">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner loading-xs text-rca-red" />
            <span>Loading settings...</span>
          </div>
        ) : error ? (
          <>
            <p className="text-error text-xs">{error}</p>
            <button onClick={() => loadSettings()} className="btn btn-xs btn-primary">
              Retry
            </button>
          </>
        ) : (
          <span>Loading settings...</span>
        )}
      </div>
    )
  }

  const activeProvider = settings.providers[settings.activeProvider]

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* Provider Selection */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
          Provider
        </label>
        <select
          value={settings.activeProvider}
          onChange={(e) =>
            saveSettings({ ...settings, activeProvider: e.target.value as ProviderName })
          }
          className="select select-sm select-bordered w-full bg-white"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      {settings.activeProvider !== 'ollama' && (
        <div>
          <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
            API Key
          </label>
          <input
            type="password"
            value={activeProvider.apiKey}
            onChange={(e) =>
              saveSettings({
                ...settings,
                providers: {
                  ...settings.providers,
                  [settings.activeProvider]: {
                    ...activeProvider,
                    apiKey: e.target.value
                  }
                }
              })
            }
            placeholder="sk-..."
            className="input input-sm input-bordered w-full bg-white"
          />
        </div>
      )}

      {/* Base URL */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
          Base URL
        </label>
        <input
          type="text"
          value={activeProvider.baseUrl}
          onChange={(e) =>
            saveSettings({
              ...settings,
              providers: {
                ...settings.providers,
                [settings.activeProvider]: {
                  ...activeProvider,
                  baseUrl: e.target.value
                }
              }
            })
          }
          className="input input-sm input-bordered w-full bg-white text-xs"
        />
      </div>

      {/* Default Model */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
          Default Model
        </label>
        {modelsLoading ? (
          <div className="flex items-center gap-2 h-8">
            <span className="loading loading-spinner loading-xs text-rca-red" />
            <span className="text-xs text-soft-charcoal/50">Loading models...</span>
          </div>
        ) : modelsFetchFailed || models.length === 0 ? (
          <input
            type="text"
            value={settings.defaultModel}
            onChange={(e) => saveSettings({ ...settings, defaultModel: e.target.value })}
            placeholder="gpt-4"
            className="input input-sm input-bordered w-full bg-white"
          />
        ) : (
          <select
            value={settings.defaultModel}
            onChange={(e) => saveSettings({ ...settings, defaultModel: e.target.value })}
            className="select select-sm select-bordered w-full bg-white"
          >
            {!models.includes(settings.defaultModel) && (
              <option value={settings.defaultModel}>{settings.defaultModel}</option>
            )}
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      {/* Temperature */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 flex justify-between">
          <span>Temperature</span>
          <span className="text-rca-red">{settings.temperature.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={settings.temperature}
          onChange={(e) =>
            saveSettings({ ...settings, temperature: parseFloat(e.target.value) })
          }
          className="range range-xs range-primary w-full"
        />
      </div>

      {/* Max Tokens */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
          Max Tokens
        </label>
        <input
          type="number"
          min={1}
          max={128000}
          value={settings.maxTokens}
          onChange={(e) =>
            saveSettings({ ...settings, maxTokens: parseInt(e.target.value) || 4096 })
          }
          className="input input-sm input-bordered w-full bg-white"
        />
      </div>

      {/* Strict Mode */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-soft-charcoal/70">
          Strict Mode
        </label>
        <input
          type="checkbox"
          checked={settings.strictMode}
          onChange={(e) => saveSettings({ ...settings, strictMode: e.target.checked })}
          className="toggle toggle-sm toggle-primary"
        />
      </div>

      <div className="divider text-xs text-soft-charcoal/40">Search APIs</div>

      {/* Tavily Key */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
          Tavily API Key
        </label>
        <input
          type="password"
          value={settings.tavilyApiKey}
          onChange={(e) => saveSettings({ ...settings, tavilyApiKey: e.target.value })}
          placeholder="tvly-..."
          className="input input-sm input-bordered w-full bg-white"
        />
      </div>

      {/* SerpAPI Key */}
      <div>
        <label className="text-xs font-medium text-soft-charcoal/70 mb-1 block">
          SerpAPI Key
        </label>
        <input
          type="password"
          value={settings.serpApiKey}
          onChange={(e) => saveSettings({ ...settings, serpApiKey: e.target.value })}
          className="input input-sm input-bordered w-full bg-white"
        />
      </div>
    </div>
  )
}
