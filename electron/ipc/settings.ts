import { handleIpc } from './typedIpc'
import { assertObject } from './validate'
import { SettingsService } from '../services/SettingsService'
import type { Settings } from '../../src/types'

/**
 * Thin IPC adapter for settings.
 * All business logic lives in SettingsService.
 *
 * Side effects (like setting workspace path) are wired by the caller
 * via the onSettingsChanged callback.
 */

let service: SettingsService

export function getCurrentSettings(): Settings {
  if (!service) {
    throw new Error('SettingsService not initialized')
  }
  return service.getCurrent()
}

export function registerSettingsHandlers(
  settingsPath: string,
  onSettingsChanged: (settings: Settings) => void
): void {
  service = new SettingsService(settingsPath)

  // Apply side effects for initial settings
  onSettingsChanged(service.getCurrent())

  handleIpc('settings:load', () => {
    const settings = service.load()
    onSettingsChanged(settings)
    return settings
  })

  handleIpc('settings:save', (_e, settings) => {
    assertObject(settings, 'settings')
    const sanitized = service.save(settings)
    onSettingsChanged(sanitized)
  })
}
