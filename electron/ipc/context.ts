import { handleIpc } from './typedIpc'
import { assertContextType, assertString } from './validate'
import { ContextService } from '../services/ContextService'

/**
 * Thin IPC adapter for context file operations.
 * All business logic lives in ContextService.
 */

let service: ContextService

export function getContextService(): ContextService {
  if (!service) {
    throw new Error('ContextService not initialized')
  }
  return service
}

export function registerContextHandlers(contextDir: string, bundledDir: string): void {
  service = new ContextService(contextDir, bundledDir)

  handleIpc('context:load', (_e, type) => {
    assertContextType(type)
    return service.load(type)
  })

  handleIpc('context:save', (_e, type, content) => {
    assertContextType(type)
    assertString(content, 'content')
    return service.save(type, content)
  })

  handleIpc('context:loadDefault', (_e, type) => {
    assertContextType(type)
    return service.loadDefault(type)
  })
}
