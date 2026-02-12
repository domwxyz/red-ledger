import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/store'
import type { ProviderName } from '@/types'

const PROVIDERS: { id: ProviderName; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'lmstudio', label: 'LM Studio' }
]

const PROVIDERS_USING_FIRST_LIST_MODEL = new Set<ProviderName>(['ollama', 'lmstudio'])
const PROVIDERS_ALLOW_BLANK_MODEL = new Set<ProviderName>([
  'openai',
  'openrouter',
  'ollama',
  'lmstudio'
])

const PROVIDER_PREFERRED_MODELS: Partial<Record<ProviderName, string>> = {
  openai: 'z-ai/glm-5',
  openrouter: 'z-ai/glm-5'
}

const PROVIDER_DEFAULT_BASE_URLS: Record<ProviderName, string> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234'
}

function resolveProviderModel(
  provider: ProviderName,
  currentModel: string | undefined,
  availableModels: string[]
): string | undefined {
  if (availableModels.length === 0) return currentModel

  if (PROVIDERS_USING_FIRST_LIST_MODEL.has(provider)) {
    return availableModels[0]
  }

  if (currentModel && availableModels.includes(currentModel)) {
    return currentModel
  }

  const preferred = PROVIDER_PREFERRED_MODELS[provider]
  if (preferred && availableModels.includes(preferred)) {
    return preferred
  }

  return availableModels[0]
}

export function SettingsPanel() {
  const settings = useSettingsStore((s) => s.settings)
  const isLoading = useSettingsStore((s) => s.isLoading)
  const error = useSettingsStore((s) => s.error)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [models, setModels] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsFetchFailed, setModelsFetchFailed] = useState(false)
  const activeProviderConfig = settings
    ? settings.providers[settings.activeProvider]
    : null
  const modelFetchKey = settings && activeProviderConfig
    ? `${settings.activeProvider}|${activeProviderConfig.baseUrl}|${activeProviderConfig.apiKey}|${activeProviderConfig.compatibility || ''}`
    : ''
  const activeProviderName = settings?.activeProvider
  const activeProviderModel = activeProviderConfig
    ? (activeProviderConfig.selectedModel !== undefined
      ? activeProviderConfig.selectedModel
      : (activeProviderName ? (PROVIDER_PREFERRED_MODELS[activeProviderName] || '') : ''))
    : ''

  // Fetch models when provider identity/config changes.
  useEffect(() => {
    if (!settings || !window.redLedger) return
    let cancelled = false

    setModels([])
    setModelsFetchFailed(false)
    setModelsLoading(true)

    const timer = setTimeout(() => {
      window.redLedger
        .listModels(settings.activeProvider)
        .then((list) => {
          if (cancelled) return
          setModels(list)
          setModelsFetchFailed(false)
        })
        .catch(() => {
          if (cancelled) return
          setModelsFetchFailed(true)
        })
        .finally(() => {
          if (!cancelled) setModelsLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelFetchKey, settings?.activeProvider])

  // Keep the active provider's selected model sane relative to the latest list.
  useEffect(() => {
    if (!settings || !activeProviderConfig || modelsLoading || modelsFetchFailed || models.length === 0) {
      return
    }

    const resolvedModel = resolveProviderModel(
      settings.activeProvider,
      activeProviderConfig.selectedModel,
      models
    )

    if (!resolvedModel) return

    const sameSelected = activeProviderConfig.selectedModel === resolvedModel
    const sameDefault = settings.defaultModel === resolvedModel
    const sameModels = JSON.stringify(activeProviderConfig.models) === JSON.stringify(models)
    if (sameSelected && sameDefault && sameModels) {
      return
    }

    saveSettings({
      ...settings,
      defaultModel: resolvedModel,
      providers: {
        ...settings.providers,
        [settings.activeProvider]: {
          ...activeProviderConfig,
          models,
          selectedModel: resolvedModel
        }
      }
    })
  }, [
    settings,
    activeProviderConfig,
    models,
    modelsLoading,
    modelsFetchFailed,
    saveSettings
  ])

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
  const saveActiveProviderModel = (model: string) => {
    const trimmed = model.trim()
    const allowBlank = PROVIDERS_ALLOW_BLANK_MODEL.has(settings.activeProvider)
    if (!allowBlank && trimmed.length === 0) return
    const nextModel = trimmed

    saveSettings({
      ...settings,
      ...(nextModel ? { defaultModel: nextModel } : {}),
      providers: {
        ...settings.providers,
        [settings.activeProvider]: {
          ...activeProvider,
          selectedModel: nextModel
        }
      }
    })
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Provider Selection */}
      <div>
        <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
          Provider
        </label>
        <select
          value={settings.activeProvider}
          onChange={(e) => {
            const nextProvider = e.target.value as ProviderName
            const remembered = settings.providers[nextProvider].selectedModel
            saveSettings({
              ...settings,
              activeProvider: nextProvider,
              ...(remembered ? { defaultModel: remembered } : {})
            })
          }}
          className="select select-sm select-bordered w-full bg-white"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      {settings.activeProvider !== 'ollama' && settings.activeProvider !== 'lmstudio' && (
        <div>
          <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
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

      {/* LM Studio Compatibility */}
      {settings.activeProvider === 'lmstudio' && (
        <div>
          <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
            Compatibility
          </label>
          <select
            value={activeProvider.compatibility || 'openai'}
            onChange={(e) =>
              saveSettings({
                ...settings,
                providers: {
                  ...settings.providers,
                  lmstudio: {
                    ...activeProvider,
                    compatibility: e.target.value as 'openai' | 'lmstudio'
                  }
                }
              })
            }
            className="select select-sm select-bordered w-full bg-white"
          >
            <option value="openai">OpenAI Endpoints</option>
            <option value="lmstudio">LM Studio Endpoints</option>
          </select>
        </div>
      )}

      {/* Base URL */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[11px] font-medium text-soft-charcoal/60 block uppercase tracking-wide">
            Base URL
          </label>
          <button
            type="button"
            onClick={() =>
              saveSettings({
                ...settings,
                providers: {
                  ...settings.providers,
                  [settings.activeProvider]: {
                    ...activeProvider,
                    baseUrl: PROVIDER_DEFAULT_BASE_URLS[settings.activeProvider]
                  }
                }
              })
            }
            className="btn btn-ghost btn-xs h-6 min-h-0 px-2 text-[10px] uppercase tracking-wide"
          >
            Reset
          </button>
        </div>
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
        <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
          Model
        </label>
        {modelsLoading ? (
          <div className="flex items-center gap-2 h-8">
            <span className="loading loading-spinner loading-xs text-rca-red" />
            <span className="text-xs text-soft-charcoal/40">Loading models...</span>
          </div>
        ) : modelsFetchFailed || models.length === 0 ? (
          <input
            type="text"
            value={activeProviderModel}
            onChange={(e) => saveActiveProviderModel(e.target.value)}
            placeholder="z-ai/glm-5"
            className="input input-sm input-bordered w-full bg-white"
          />
        ) : (
          <select
            value={activeProviderModel}
            onChange={(e) => saveActiveProviderModel(e.target.value)}
            className="select select-sm select-bordered w-full bg-white"
          >
            {!models.includes(activeProviderModel) && activeProviderModel && (
              <option value={activeProviderModel}>{activeProviderModel}</option>
            )}
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      {/* Temperature */}
      <div>
        <div className="flex items-center justify-between py-0.5 mb-1">
          <label className="text-[11px] font-medium text-soft-charcoal/60 uppercase tracking-wide">
            Temperature
          </label>
          <input
            type="checkbox"
            checked={settings.temperatureEnabled}
            onChange={(e) => saveSettings({ ...settings, temperatureEnabled: e.target.checked })}
            className="toggle toggle-sm toggle-primary"
          />
        </div>
        <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 flex justify-between uppercase tracking-wide">
          <span>Value</span>
          <span className={`normal-case tabular-nums ${settings.temperatureEnabled ? 'text-rca-red' : 'text-soft-charcoal/40'}`}>
            {settings.temperature.toFixed(1)}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={settings.temperature}
          disabled={!settings.temperatureEnabled}
          onChange={(e) =>
            saveSettings({ ...settings, temperature: parseFloat(e.target.value) })
          }
          className={`range range-xs range-primary w-full ${settings.temperatureEnabled ? '' : 'opacity-40 cursor-not-allowed'}`}
        />
      </div>

      {/* Max Tokens */}
      <div>
        <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
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
      <div className="flex items-center justify-between py-0.5">
        <label className="text-[11px] font-medium text-soft-charcoal/60 uppercase tracking-wide">
          Strict Mode
        </label>
        <input
          type="checkbox"
          checked={settings.strictMode}
          onChange={(e) => saveSettings({ ...settings, strictMode: e.target.checked })}
          className="toggle toggle-sm toggle-primary"
        />
      </div>

      <div className="divider text-[10px] text-soft-charcoal/30 uppercase tracking-widest my-1">Search APIs</div>

      {/* Tavily Key */}
      <div>
        <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
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
        <label className="text-[11px] font-medium text-soft-charcoal/60 mb-1 block uppercase tracking-wide">
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
