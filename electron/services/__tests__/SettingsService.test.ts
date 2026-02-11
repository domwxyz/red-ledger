/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { sanitizeSettings } from '../SettingsService'

describe('sanitizeSettings', () => {
  it('returns defaults for undefined input', () => {
    const result = sanitizeSettings(undefined)
    expect(result.activeProvider).toBe('openai')
    expect(result.temperatureEnabled).toBe(false)
    expect(result.temperature).toBe(0.7)
    expect(result.maxTokens).toBe(4096)
    expect(result.strictMode).toBe(false)
    expect(result.defaultModel).toBe('gpt-4')
  })

  it('returns defaults for empty object', () => {
    const result = sanitizeSettings({})
    expect(result.activeProvider).toBe('openai')
    expect(result.temperatureEnabled).toBe(false)
    expect(result.providers.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(result.providers.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(result.providers.ollama.baseUrl).toBe('http://localhost:11434')
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
    expect(sanitizeSettings({ temperature: NaN } as any).temperature).toBe(0.7)
  })

  it('rejects NaN maxTokens', () => {
    expect(sanitizeSettings({ maxTokens: NaN } as any).maxTokens).toBe(4096)
  })

  it('rejects invalid activeProvider', () => {
    expect(sanitizeSettings({ activeProvider: 'invalid' } as any).activeProvider).toBe('openai')
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
        ollama: { apiKey: '', baseUrl: '', models: [] }
      }
    } as any)
    expect(result.providers.openai.models).toEqual(['gpt-4', 'gpt-3.5'])
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
