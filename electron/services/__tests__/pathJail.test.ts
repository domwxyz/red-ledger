import { describe, it, expect } from 'vitest'
import { resolveWorkspacePath, PathJailError } from '../pathJail'

const ROOT = process.platform === 'win32'
  ? 'C:\\workspace'
  : '/workspace'

describe('resolveWorkspacePath', () => {
  it('resolves a simple relative path', () => {
    const result = resolveWorkspacePath(ROOT, 'src/index.ts')
    expect(result).toContain('src')
    expect(result).toContain('index.ts')
  })

  it('rejects ../ traversal', () => {
    expect(() => resolveWorkspacePath(ROOT, '../etc/passwd'))
      .toThrow(PathJailError)
  })

  it('rejects ..\\ traversal', () => {
    expect(() => resolveWorkspacePath(ROOT, '..\\etc\\passwd'))
      .toThrow(PathJailError)
  })

  it('rejects absolute Unix paths', () => {
    expect(() => resolveWorkspacePath(ROOT, '/etc/passwd'))
      .toThrow(PathJailError)
  })

  it('rejects null bytes', () => {
    expect(() => resolveWorkspacePath(ROOT, 'file\0.txt'))
      .toThrow(PathJailError)
  })

  it('rejects control characters', () => {
    expect(() => resolveWorkspacePath(ROOT, 'file\x01.txt'))
      .toThrow(PathJailError)
  })

  it('rejects empty paths', () => {
    expect(() => resolveWorkspacePath(ROOT, ''))
      .toThrow(PathJailError)
  })

  it('rejects empty workspace root', () => {
    expect(() => resolveWorkspacePath('', 'file.txt'))
      .toThrow(PathJailError)
  })

  it('rejects tilde home paths', () => {
    expect(() => resolveWorkspacePath(ROOT, '~/secret'))
      .toThrow(PathJailError)
  })

  it('rejects UNC paths', () => {
    expect(() => resolveWorkspacePath(ROOT, '\\\\server\\share'))
      .toThrow(PathJailError)
  })

  it('error has correct code', () => {
    try {
      resolveWorkspacePath(ROOT, '../escape')
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PathJailError)
      expect((err as PathJailError).code).toBe('PATH_TRAVERSAL')
    }
  })
})

if (process.platform === 'win32') {
  describe('resolveWorkspacePath (Windows-specific)', () => {
    it('rejects Windows absolute paths', () => {
      expect(() => resolveWorkspacePath(ROOT, 'C:\\Windows\\System32'))
        .toThrow(PathJailError)
    })

    it('rejects invalid Windows chars', () => {
      expect(() => resolveWorkspacePath(ROOT, 'file<name>.txt'))
        .toThrow(PathJailError)
    })
  })
}
