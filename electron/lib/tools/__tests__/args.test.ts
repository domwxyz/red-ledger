import { describe, expect, it } from 'vitest'
import {
  numberArg,
  optionalStringArg,
  requireObjectArgs,
  requireStringArg
} from '../args'
import { PathJailError } from '../../../services/pathJail'

describe('tool args validators', () => {
  it('requireObjectArgs accepts plain objects', () => {
    expect(requireObjectArgs({ path: 'src/index.ts' }, 'read_file')).toEqual({
      path: 'src/index.ts'
    })
  })

  it('requireObjectArgs rejects arrays and primitives', () => {
    expect(() => requireObjectArgs([], 'read_file')).toThrow(PathJailError)
    expect(() => requireObjectArgs('x', 'read_file')).toThrow(PathJailError)
  })

  it('requireStringArg enforces non-empty strings by default', () => {
    expect(requireStringArg({ query: ' hello ' }, 'query', 'web_search')).toBe('hello')
    expect(() => requireStringArg({ query: '   ' }, 'query', 'web_search')).toThrow(PathJailError)
  })

  it('optionalStringArg returns undefined for absent values', () => {
    expect(optionalStringArg({}, 'path', 'list_files')).toBeUndefined()
    expect(optionalStringArg({ path: null }, 'path', 'list_files')).toBeUndefined()
  })

  it('numberArg applies default, integer coercion, and bounds', () => {
    const args = { max_chars: '25000.7' }
    const value = numberArg(args, 'max_chars', 'fetch_url', {
      defaultValue: 20_000,
      min: 1_000,
      max: 100_000,
      integer: true
    })
    expect(value).toBe(25000)

    expect(numberArg({}, 'num_results', 'web_search', {
      defaultValue: 5,
      min: 1,
      max: 10,
      integer: true
    })).toBe(5)

    expect(numberArg({ num_results: 999 }, 'num_results', 'web_search', {
      min: 1,
      max: 10,
      integer: true
    })).toBe(10)
  })

  it('numberArg rejects invalid numeric input', () => {
    expect(() => numberArg({ num_results: 'abc' }, 'num_results', 'web_search')).toThrow(PathJailError)
  })
})
