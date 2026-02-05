import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { setWorkspacePath } from './fs'
import type { Settings } from '../../src/types'

// ─── Default Settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'openai',
  providers: {
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      models: []
    },
    openrouter: {
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: []
    },
    ollama: {
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      models: []
    }
  },
  defaultModel: 'gpt-4',
  temperature: 0.7,
  maxTokens: 4096,
  strictMode: false,
  tavilyApiKey: '',
  serpApiKey: '',
  lastWorkspacePath: null
}

// ─── Current settings reference (in-memory for quick access) ─────────────────

let currentSettings: Settings = { ...DEFAULT_SETTINGS }

function getSettingsPath(): string {
  // Check for portable mode
  const portablePath = join(process.resourcesPath, 'settings.json')
  if (existsSync(portablePath)) {
    return portablePath
  }
  return join(app.getPath('userData'), 'settings.json')
}

function loadSettingsFromDisk(): Settings {
  const settingsPath = getSettingsPath()
  try {
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<Settings>
      // Merge with defaults to handle newly added fields
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch {
    // Corrupted settings file — use defaults
  }
  return { ...DEFAULT_SETTINGS }
}

function saveSettingsToDisk(settings: Settings): void {
  const settingsPath = getSettingsPath()
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Apply side effects when settings change.
 * Called after settings are loaded or saved.
 */
function applySettings(settings: Settings): void {
  currentSettings = settings
  setWorkspacePath(settings.lastWorkspacePath ?? null)
}

export function getCurrentSettings(): Settings {
  return currentSettings
}

export function registerSettingsHandlers(): void {
  // Load settings on registration
  currentSettings = loadSettingsFromDisk()

  ipcMain.handle('settings:load', () => {
    currentSettings = loadSettingsFromDisk()
    applySettings(currentSettings)
    return currentSettings
  })

  ipcMain.handle('settings:save', (_event, settings: Settings) => {
    saveSettingsToDisk(settings)
    applySettings(settings)
  })
}
