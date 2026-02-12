import type { BaseLLMProvider } from './base'
import type { ProviderName, ProviderSettings } from '../../../src/types'

/**
 * Provider registry — maps provider names to factory functions.
 * Each provider file self-registers at import time.
 * Adding a new provider = one file + one registerProvider() call.
 */

interface ProviderEntry {
  name: ProviderName
  displayName: string
  defaultBaseUrl: string
  factory: (settings: ProviderSettings) => BaseLLMProvider
}

const providers = new Map<ProviderName, ProviderEntry>()

export function registerProvider(entry: ProviderEntry): void {
  providers.set(entry.name, entry)
}

export function createProvider(name: ProviderName, settings: ProviderSettings): BaseLLMProvider {
  const entry = providers.get(name)
  if (!entry) throw new Error(`Unknown provider: ${name}`)
  return entry.factory(settings)
}

export function listProviders(): ProviderEntry[] {
  return [...providers.values()]
}
