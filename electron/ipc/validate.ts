/**
 * Lightweight runtime validators for IPC boundary values.
 * Used in IPC handlers to validate arguments before passing to services.
 * Intentionally small — just enough to catch renderer bugs early.
 */

export function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string, got ${typeof value}`)
  }
  return value
}

export function assertOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return assertString(value, name)
}

export function assertObject(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

export function assertOptionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean, got ${typeof value}`)
  }
  return value
}

export function assertOptionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number') {
    throw new Error(`${name} must be a number, got ${typeof value}`)
  }
  return value
}

export function assertContextType(value: unknown): 'system' | 'user' | 'org' {
  if (value !== 'system' && value !== 'user' && value !== 'org') {
    throw new Error(`context type must be 'system', 'user', or 'org', got '${value}'`)
  }
  return value
}
