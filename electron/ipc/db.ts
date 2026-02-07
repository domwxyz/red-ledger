import { app, ipcMain } from 'electron'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import type Database from 'better-sqlite3'
import type { Conversation, Message } from '../../src/types'

// ─── Database Manager Singleton ──────────────────────────────────────────────

export class DatabaseManager {
  private static instance: DatabaseManager
  private db: Database.Database | null = null
  private statements: Map<string, Database.Statement> = new Map()

  private constructor() {
    this.initialize()
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  private getDatabasePath(): string {
    // Check for portable mode: settings.json next to resources
    const portablePath = join(process.resourcesPath, 'conversations.db')
    const settingsPath = join(process.resourcesPath, 'settings.json')

    try {
      const fs = require('fs')
      if (fs.existsSync(settingsPath)) {
        return portablePath
      }
    } catch {
      // Fall through to standard mode
    }

    return join(app.getPath('userData'), 'conversations.db')
  }

  private initialize(): void {
    const dbPath = this.getDatabasePath()

    // Dynamic require because better-sqlite3 is a native module
    // and must be loaded at runtime in the main process
    const BetterSqlite3 = require('better-sqlite3')
    this.db = new BetterSqlite3(dbPath) as Database.Database

    // Enable WAL mode and foreign keys
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.createTables()
    this.registerIpcHandlers()
  }

  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New Chat',
        model TEXT NOT NULL DEFAULT 'gpt-4',
        provider TEXT NOT NULL DEFAULT 'openai'
          CHECK(provider IN ('openai', 'openrouter', 'ollama')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        workspace_path TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tool_calls TEXT,
        timestamp TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
    `)
  }

  getDatabase(): Database.Database {
    if (!this.db) {
      this.initialize()
    }
    return this.db!
  }

  private getStatement(key: string, sql: string): Database.Statement {
    if (!this.statements.has(key)) {
      this.statements.set(key, this.getDatabase().prepare(sql))
    }
    return this.statements.get(key)!
  }

  close(): void {
    if (this.db) {
      this.statements.clear()
      this.db.close()
      this.db = null
    }
  }

  // ─── Column Mapping Helpers ──────────────────────────────────────────────
  // DB uses snake_case, TypeScript uses camelCase

  private toConversation(row: Record<string, unknown>): Conversation {
    return {
      id: row.id as string,
      title: row.title as string,
      model: row.model as string,
      provider: row.provider as Conversation['provider'],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      workspacePath: row.workspace_path as string | null
    }
  }

  private toMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      role: row.role as Message['role'],
      content: row.content as string,
      toolCalls: row.tool_calls as string | undefined,
      timestamp: row.timestamp as string,
      createdAt: row.created_at as number
    }
  }

  // ─── IPC Handler Registration ────────────────────────────────────────────

  private registerIpcHandlers(): void {
    ipcMain.handle('db:listConversations', () => {
      const rows = this.getStatement(
        'listConversations',
        'SELECT * FROM conversations ORDER BY updated_at DESC'
      ).all() as Record<string, unknown>[]

      return rows.map(r => this.toConversation(r))
    })

    ipcMain.handle('db:getConversation', (_event, id: string) => {
      const row = this.getStatement(
        'getConversation',
        'SELECT * FROM conversations WHERE id = ?'
      ).get(id) as Record<string, unknown> | undefined

      return row ? this.toConversation(row) : null
    })

    ipcMain.handle('db:createConversation', (_event, data: Partial<Conversation>) => {
      const id = uuidv4()
      const now = Date.now()

      this.getStatement(
        'createConversation',
        `INSERT INTO conversations (id, title, model, provider, created_at, updated_at, workspace_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        data.title || 'New Chat',
        data.model || 'gpt-4',
        data.provider || 'openai',
        now,
        now,
        data.workspacePath || null
      )

      return this.toConversation(
        this.getStatement('getConversation', 'SELECT * FROM conversations WHERE id = ?')
          .get(id) as Record<string, unknown>
      )
    })

    ipcMain.handle('db:updateConversation', (_event, id: string, data: Partial<Conversation>) => {
      const now = Date.now()

      // Use COALESCE pattern for partial updates
      this.getStatement(
        'updateConversation',
        `UPDATE conversations SET
          title = COALESCE(?, title),
          model = COALESCE(?, model),
          provider = COALESCE(?, provider),
          updated_at = ?,
          workspace_path = COALESCE(?, workspace_path)
         WHERE id = ?`
      ).run(
        data.title ?? null,
        data.model ?? null,
        data.provider ?? null,
        now,
        data.workspacePath !== undefined ? data.workspacePath : null,
        id
      )
    })

    ipcMain.handle('db:deleteConversation', (_event, id: string) => {
      // CASCADE handles message deletion, but we're explicit for safety
      const deleteInTransaction = this.getDatabase().transaction((convId: string) => {
        this.getStatement(
          'deleteMessages',
          'DELETE FROM messages WHERE conversation_id = ?'
        ).run(convId)

        this.getStatement(
          'deleteConversation',
          'DELETE FROM conversations WHERE id = ?'
        ).run(convId)
      })

      deleteInTransaction(id)
    })

    ipcMain.handle('db:listMessages', (_event, conversationId: string) => {
      const rows = this.getStatement(
        'listMessages',
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
      ).all(conversationId) as Record<string, unknown>[]

      return rows.map(r => this.toMessage(r))
    })

    ipcMain.handle('db:createMessage', (_event, data: Omit<Message, 'id' | 'createdAt' | 'timestamp'>) => {
      const id = uuidv4()
      const now = Date.now()
      const timestamp = new Date().toISOString()

      const createInTransaction = this.getDatabase().transaction(() => {
        this.getStatement(
          'createMessage',
          `INSERT INTO messages (id, conversation_id, role, content, tool_calls, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          data.conversationId,
          data.role,
          data.content,
          data.toolCalls || null,
          timestamp,
          now
        )

        // Bump parent conversation's updatedAt
        this.getStatement(
          'bumpConversation',
          'UPDATE conversations SET updated_at = ? WHERE id = ?'
        ).run(now, data.conversationId)
      })

      createInTransaction()

      return this.toMessage(
        this.getStatement(
          'getMessage',
          'SELECT * FROM messages WHERE id = ?'
        ).get(id) as Record<string, unknown>
      )
    })

    ipcMain.handle('db:updateMessage', (_event, id: string, data: Partial<Message>) => {
      this.getStatement(
        'updateMessage',
        `UPDATE messages SET
          content = COALESCE(?, content),
          tool_calls = COALESCE(?, tool_calls)
         WHERE id = ?`
      ).run(
        data.content ?? null,
        data.toolCalls ?? null,
        id
      )
    })

    // Delete a message and all messages after it in the same conversation
    ipcMain.handle('db:deleteMessagesFrom', (_event, conversationId: string, messageId: string) => {
      const row = this.getStatement(
        'getMessage',
        'SELECT * FROM messages WHERE id = ?'
      ).get(messageId) as Record<string, unknown> | undefined

      if (!row) return

      this.getStatement(
        'deleteMessagesFrom',
        'DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?'
      ).run(conversationId, row.created_at)
    })
  }
}
