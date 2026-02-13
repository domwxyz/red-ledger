import { PathJailError } from '../../services/pathJail'

interface StringArgOptions {
  trim?: boolean
  allowEmpty?: boolean
}

interface NumberArgOptions {
  min?: number
  max?: number
  integer?: boolean
  defaultValue?: number
}

function invalidInput(toolName: string, message: string): never {
  throw new PathJailError('INVALID_INPUT', `${toolName} ${message}`)
}

export function requireObjectArgs(args: unknown, toolName: string): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    invalidInput(toolName, 'requires an object argument payload')
  }
  return args as Record<string, unknown>
}

export function requireStringArg(
  args: Record<string, unknown>,
  key: string,
  toolName: string,
  options: StringArgOptions = {}
): string {
  const value = args[key]
  if (typeof value !== 'string') {
    invalidInput(toolName, `requires a "${key}" string argument`)
  }

  const normalized = options.trim === false ? value : value.trim()
  if (!options.allowEmpty && normalized.length === 0) {
    invalidInput(toolName, `requires a non-empty "${key}" argument`)
  }

  return normalized
}

export function optionalStringArg(
  args: Record<string, unknown>,
  key: string,
  toolName: string,
  options: StringArgOptions = {}
): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  return requireStringArg(args, key, toolName, options)
}

export function numberArg(
  args: Record<string, unknown>,
  key: string,
  toolName: string,
  options: NumberArgOptions = {}
): number {
  const value = args[key]
  if (value === undefined || value === null || value === '') {
    if (options.defaultValue !== undefined) {
      return options.defaultValue
    }
    invalidInput(toolName, `requires a "${key}" numeric argument`)
  }

  const parsed = typeof value === 'number'
    ? value
    : Number.parseFloat(String(value))

  if (!Number.isFinite(parsed)) {
    invalidInput(toolName, `received an invalid "${key}" numeric argument`)
  }

  let out = parsed
  if (options.integer) out = Math.floor(out)
  if (options.min !== undefined) out = Math.max(options.min, out)
  if (options.max !== undefined) out = Math.min(options.max, out)
  return out
}
