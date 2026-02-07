import { describe, it, expect } from 'vitest'
import { gitignoreGlobToRegex, parseGitignore, isIgnoredByGitignore } from '../gitignore'

describe('gitignoreGlobToRegex', () => {
  it('matches a literal name', () => {
    const re = gitignoreGlobToRegex('foo')
    expect(re.test('foo')).toBe(true)
    expect(re.test('bar')).toBe(false)
  })

  it('handles * wildcard (no slashes)', () => {
    const re = gitignoreGlobToRegex('*.js')
    expect(re.test('index.js')).toBe(true)
    expect(re.test('src/index.js')).toBe(false) // * doesn't match /
  })

  it('handles ** wildcard', () => {
    const re = gitignoreGlobToRegex('**/foo')
    expect(re.test('foo')).toBe(true)
    expect(re.test('bar/foo')).toBe(true)
    expect(re.test('a/b/foo')).toBe(true)
  })

  it('handles ? wildcard', () => {
    const re = gitignoreGlobToRegex('fil?')
    expect(re.test('file')).toBe(true)
    expect(re.test('fill')).toBe(true)
    expect(re.test('files')).toBe(false)
  })

  it('escapes regex special chars', () => {
    const re = gitignoreGlobToRegex('file.txt')
    expect(re.test('file.txt')).toBe(true)
    expect(re.test('filextxt')).toBe(false) // . is escaped
  })
})

describe('parseGitignore', () => {
  it('parses simple patterns', () => {
    const rules = parseGitignore('node_modules\n*.log')
    expect(rules).toHaveLength(2)
  })

  it('skips comments and empty lines', () => {
    const rules = parseGitignore('# comment\n\nnode_modules')
    expect(rules).toHaveLength(1)
  })

  it('handles negation', () => {
    const rules = parseGitignore('!important.log')
    expect(rules).toHaveLength(1)
    expect(rules[0].negation).toBe(true)
  })

  it('handles directory-only patterns', () => {
    const rules = parseGitignore('build/')
    expect(rules).toHaveLength(1)
    expect(rules[0].directoryOnly).toBe(true)
  })

  it('anchors patterns with leading slash', () => {
    const rules = parseGitignore('/dist')
    expect(rules).toHaveLength(1)
    // Should match 'dist' at root, not '**/dist'
    expect(rules[0].regex.test('dist')).toBe(true)
    expect(rules[0].regex.test('src/dist')).toBe(false)
  })
})

describe('isIgnoredByGitignore', () => {
  it('ignores matching files', () => {
    const rules = parseGitignore('*.log')
    expect(isIgnoredByGitignore('error.log', false, rules)).toBe(true)
    expect(isIgnoredByGitignore('error.txt', false, rules)).toBe(false)
  })

  it('handles negation (un-ignore)', () => {
    const rules = parseGitignore('*.log\n!important.log')
    expect(isIgnoredByGitignore('error.log', false, rules)).toBe(true)
    expect(isIgnoredByGitignore('important.log', false, rules)).toBe(false)
  })

  it('directory-only rules skip files', () => {
    const rules = parseGitignore('build/')
    expect(isIgnoredByGitignore('build', true, rules)).toBe(true)
    expect(isIgnoredByGitignore('build', false, rules)).toBe(false)
  })

  it('handles nested paths', () => {
    const rules = parseGitignore('node_modules')
    expect(isIgnoredByGitignore('src/node_modules', true, rules)).toBe(true)
  })
})
