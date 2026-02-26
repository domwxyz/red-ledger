import { describe, expect, it, vi } from 'vitest'
import { ConversationService } from '../ConversationService'

type MigrationHarness = {
  db: {
    exec: (sql: string) => void
    prepare: (sql: string) => { get: () => { sql: string } | undefined }
    transaction: (fn: () => void) => () => void
  }
  migrateConversationProviderConstraintIfNeeded: () => void
}

describe('ConversationService schema migrations', () => {
  it('migrates legacy provider constraints when lmstudio is missing', () => {
    const exec = vi.fn()
    const transaction = vi.fn((fn: () => void) => fn)
    const prepare = vi.fn((sql: string) => {
      if (sql.includes('sqlite_master')) {
        return {
          get: () => ({
            sql: `CREATE TABLE conversations (
              id TEXT PRIMARY KEY,
              provider TEXT NOT NULL DEFAULT 'openai'
                CHECK(provider IN ('openai', 'openrouter', 'ollama'))
            )`
          })
        }
      }

      return {
        get: () => undefined
      }
    })

    const service = Object.create(ConversationService.prototype) as unknown as MigrationHarness
    service.db = { exec, prepare, transaction }
    service.migrateConversationProviderConstraintIfNeeded()

    expect(exec).toHaveBeenCalledWith('PRAGMA foreign_keys = OFF')
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE conversations_new'))
    expect(exec).toHaveBeenCalledWith('PRAGMA foreign_keys = ON')
  })

  it('skips migration when lmstudio is already present', () => {
    const exec = vi.fn()
    const transaction = vi.fn((fn: () => void) => fn)
    const prepare = vi.fn(() => ({
      get: () => ({
        sql: `CREATE TABLE conversations (
          provider TEXT NOT NULL DEFAULT 'openai'
            CHECK(provider IN ('openai', 'openrouter', 'ollama', 'lmstudio'))
        )`
      })
    }))

    const service = Object.create(ConversationService.prototype) as unknown as MigrationHarness
    service.db = { exec, prepare, transaction }
    service.migrateConversationProviderConstraintIfNeeded()

    expect(exec).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })
})
