/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { sanitizeSettings } from '../SettingsService'

describe('sanitizeSettings', () => {
  it('returns defaults for undefined input', () => {
    const result = sanitizeSettings(undefined)
    expect(result.activeProvider).toBe('openrouter')
    expect(result.temperatureEnabled).toBe(false)
    expect(result.temperature).toBe(1.0)
    expect(result.maxTokens).toBe(8192)
    expect(result.strictMode).toBe(false)
    expect(result.defaultModel).toBe('z-ai/glm-5')
    expect(result.providers.openrouter.selectedModel).toBe('z-ai/glm-5')
  })

  it('returns defaults for empty object', () => {
    const result = sanitizeSettings({})
    expect(result.activeProvider).toBe('openrouter')
    expect(result.temperatureEnabled).toBe(false)
    expect(result.providers.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(result.providers.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(result.providers.ollama.baseUrl).toBe('http://localhost:11434')
    expect(result.providers.lmstudio.baseUrl).toBe('http://localhost:1234')
    expect(result.providers.lmstudio.compatibility).toBe('openai')
    expect(result.providers.openrouter.selectedModel).toBe('z-ai/glm-5')
  })

  it('preserves valid temperatureEnabled value', () => {
    expect(sanitizeSettings({ temperatureEnabled: true } as any).temperatureEnabled).toBe(true)
    expect(sanitizeSettings({ temperatureEnabled: false } as any).temperatureEnabled).toBe(false)
  })

  it('defaults temperatureEnabled for invalid input', () => {
    expect(sanitizeSettings({ temperatureEnabled: 'yes' as any } as any).temperatureEnabled).toBe(false)
  })

  it('clamps temperature to 0–2 range', () => {
    expect(sanitizeSettings({ temperature: -1 } as any).temperature).toBe(0)
    expect(sanitizeSettings({ temperature: 5 } as any).temperature).toBe(2)
    expect(sanitizeSettings({ temperature: 1.5 } as any).temperature).toBe(1.5)
  })

  it('rounds temperature to one decimal', () => {
    expect(sanitizeSettings({ temperature: 0.77 } as any).temperature).toBe(0.8)
    expect(sanitizeSettings({ temperature: 0.14 } as any).temperature).toBe(0.1)
  })

  it('clamps maxTokens to 1–128000', () => {
    expect(sanitizeSettings({ maxTokens: 0 } as any).maxTokens).toBe(1)
    expect(sanitizeSettings({ maxTokens: 200000 } as any).maxTokens).toBe(128000)
    expect(sanitizeSettings({ maxTokens: 1000 } as any).maxTokens).toBe(1000)
  })

  it('floors maxTokens to integer', () => {
    expect(sanitizeSettings({ maxTokens: 1000.7 } as any).maxTokens).toBe(1000)
  })

  it('rejects NaN temperature', () => {
    expect(sanitizeSettings({ temperature: NaN } as any).temperature).toBe(1.0)
  })

  it('rejects NaN maxTokens', () => {
    expect(sanitizeSettings({ maxTokens: NaN } as any).maxTokens).toBe(8192)
  })

  it('rejects invalid activeProvider', () => {
    expect(sanitizeSettings({ activeProvider: 'invalid' } as any).activeProvider).toBe('openrouter')
  })

  it('preserves valid provider settings', () => {
    const result = sanitizeSettings({
      providers: {
        openai: { apiKey: 'sk-test', baseUrl: 'https://custom.api.com', models: ['gpt-4'] },
        openrouter: { apiKey: '', baseUrl: '', models: [] },
        ollama: { apiKey: '', baseUrl: '', models: [] }
      }
    } as any)
    expect(result.providers.openai.apiKey).toBe('sk-test')
    expect(result.providers.openai.baseUrl).toBe('https://custom.api.com')
    expect(result.providers.openai.models).toEqual(['gpt-4'])
  })

  it('falls back to default baseUrl for empty string', () => {
    const result = sanitizeSettings({
      providers: {
        openai: { apiKey: '', baseUrl: '', models: [] },
        openrouter: { apiKey: '', baseUrl: '  ', models: [] },
        ollama: { apiKey: '', baseUrl: '', models: [] }
      }
    } as any)
    expect(result.providers.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(result.providers.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1')
  })

  it('filters non-string model entries', () => {
    const result = sanitizeSettings({
      providers: {
        openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4', 42, null, 'gpt-3.5'] },
        openrouter: { apiKey: '', baseUrl: '', models: [] },
        ollama: { apiKey: '', baseUrl: '', models: [] },
        lmstudio: { apiKey: '', baseUrl: '', models: [] }
      }
    } as any)
    expect(result.providers.openai.models).toEqual(['gpt-4', 'gpt-3.5'])
  })

  it('sanitizes lmstudio compatibility', () => {
    const valid = sanitizeSettings({
      providers: {
        lmstudio: { apiKey: '', baseUrl: 'http://localhost:1234', models: [], compatibility: 'lmstudio' }
      }
    } as any)
    expect(valid.providers.lmstudio.compatibility).toBe('lmstudio')

    const invalid = sanitizeSettings({
      providers: {
        lmstudio: { apiKey: '', baseUrl: 'http://localhost:1234', models: [], compatibility: 'invalid' }
      }
    } as any)
    expect(invalid.providers.lmstudio.compatibility).toBe('openai')
  })

  it('migrates legacy defaultModel into active provider selectedModel', () => {
    const result = sanitizeSettings({
      activeProvider: 'openai',
      defaultModel: 'gpt-4o-mini'
    } as any)

    expect(result.providers.openai.selectedModel).toBe('gpt-4o-mini')
  })

  it('preserves intentionally blank selectedModel values', () => {
    const result = sanitizeSettings({
      providers: {
        openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', models: [], selectedModel: '' },
        openrouter: { apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', models: [], selectedModel: '' }
      }
    } as any)

    expect(result.providers.openai.selectedModel).toBe('')
    expect(result.providers.openrouter.selectedModel).toBe('')
  })

  it('migrates legacy jamba models to glm-5', () => {
    const result = sanitizeSettings({
      activeProvider: 'openai',
      defaultModel: 'ai21/jamba-large-1.7',
      providers: {
        openai: {
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          models: [],
          selectedModel: 'ai21/jamba-large-1.7'
        }
      }
    } as any)

    expect(result.defaultModel).toBe('z-ai/glm-5')
    expect(result.providers.openai.selectedModel).toBe('z-ai/glm-5')
  })

  it('preserves lastWorkspacePath when string', () => {
    const result = sanitizeSettings({ lastWorkspacePath: '/home/user/project' } as any)
    expect(result.lastWorkspacePath).toBe('/home/user/project')
  })

  it('nulls lastWorkspacePath for non-string', () => {
    expect(sanitizeSettings({ lastWorkspacePath: 42 } as any).lastWorkspacePath).toBeNull()
    expect(sanitizeSettings({ lastWorkspacePath: undefined } as any).lastWorkspacePath).toBeNull()
  })
})
