// ─── Provider Types ──────────────────────────────────────────────────────────

export type ProviderName = 'openai' | 'openrouter' | 'ollama'

export interface ProviderSettings {
  apiKey: string
  baseUrl: string
  models: string[]
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  activeProvider: ProviderName
  providers: Record<ProviderName, ProviderSettings>
  defaultModel: string
  temperature: number     // 0.0–2.0
  maxTokens: number       // 1–128000
  strictMode: boolean
  tavilyApiKey: string
  serpApiKey: string
  lastWorkspacePath: string | null
}

// ─── Conversations ───────────────────────────────────────────────────────────

export interface Conversation {
  id: string
  title: string
  model: string
  provider: ProviderName
  createdAt: number
  updatedAt: number
  workspacePath: string | null
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: string     // JSON-serialized ToolCall[]
  createdAt: number
}

// ─── Tool Calls ──────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
  /** Character offset into Message.content where this tool call was initiated. */
  contentOffset?: number
}

// ─── LLM Request ─────────────────────────────────────────────────────────────

export interface LLMRequest {
  conversationId: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  model: string
  provider: ProviderName
  temperature?: number
  maxTokens?: number
}

// ─── Stream Chunks ───────────────────────────────────────────────────────────

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done'
  content?: string
  toolCall?: ToolCall
  error?: string
}

// ─── File Tree ───────────────────────────────────────────────────────────────

export interface FileNode {
  name: string
  path: string       // Relative to workspace root, forward slashes
  type: 'file' | 'directory'
  children?: FileNode[]
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

// ─── Attachments ─────────────────────────────────────────────────────────

export interface Attachment {
  name: string
  content: string
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'PATH_TRAVERSAL'
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'WORKSPACE_NOT_SET'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_INPUT'
  | 'DATABASE_ERROR'
  | 'USER_DENIED'
  | 'UNKNOWN'

// ─── Toast ───────────────────────────────────────────────────────────────────

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

// ─── IPC API (exposed via contextBridge as window.redLedger) ─────────────────

export interface RedLedgerAPI {
  // Workspace & File Operations
  selectWorkspace(): Promise<string | null>
  readFile(relativePath: string): Promise<string>
  writeFile(relativePath: string, content: string, append?: boolean): Promise<void>
  listFiles(relativePath?: string): Promise<FileNode[]>

  // Context Files
  loadContext(type: 'system' | 'user' | 'org'): Promise<string>
  saveContext(type: 'system' | 'user' | 'org', content: string): Promise<void>
  loadDefaultContext(type: 'system' | 'user' | 'org'): Promise<string>

  // Conversations
  listConversations(): Promise<Conversation[]>
  getConversation(id: string): Promise<Conversation | null>
  createConversation(data: Partial<Conversation>): Promise<Conversation>
  updateConversation(id: string, data: Partial<Conversation>): Promise<void>
  deleteConversation(id: string): Promise<void>

  // Messages
  listMessages(conversationId: string): Promise<Message[]>
  createMessage(data: Omit<Message, 'id' | 'createdAt'>): Promise<Message>
  updateMessage(id: string, data: Partial<Message>): Promise<void>

  // LLM Streaming
  sendMessage(request: LLMRequest, onStream: (chunk: StreamChunk) => void): () => void
  listModels(provider: string): Promise<string[]>

  // Settings
  loadSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>

  // Search
  webSearch(query: string, numResults?: number): Promise<SearchResult[]>

  // Dialogs
  showConfirmDialog(options: { title: string; message: string; detail?: string }): Promise<boolean>
  openTextFile(): Promise<string | null>
  openAttachmentFiles(): Promise<Attachment[]>
}

// Extend Window interface for the renderer
declare global {
  interface Window {
    redLedger: RedLedgerAPI
  }
}
