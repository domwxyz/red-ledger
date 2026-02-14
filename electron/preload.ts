import { contextBridge, ipcRenderer } from 'electron'
import type { RedLedgerAPI } from '../src/types'

/**
 * The preload script exposes a single `window.redLedger` API object.
 * This is the ONLY surface the renderer process can use to interact
 * with the main process. No native modules are loaded here.
 */
const api: RedLedgerAPI = {
  // ─── Workspace & File Operations ─────────────────────────────────────────

  selectWorkspace: () => ipcRenderer.invoke('fs:selectWorkspace'),

  readFile: (relativePath: string) =>
    ipcRenderer.invoke('fs:readFile', relativePath),

  writeFile: (relativePath: string, content: string, append?: boolean) =>
    ipcRenderer.invoke('fs:writeFile', relativePath, content, append),

  listFiles: (relativePath?: string) =>
    ipcRenderer.invoke('fs:listFiles', relativePath),

  // ─── Context Files ───────────────────────────────────────────────────────

  loadContext: (type: 'system' | 'user' | 'org') =>
    ipcRenderer.invoke('context:load', type),

  saveContext: (type: 'system' | 'user' | 'org', content: string) =>
    ipcRenderer.invoke('context:save', type, content),

  loadDefaultContext: (type: 'system' | 'user' | 'org') =>
    ipcRenderer.invoke('context:loadDefault', type),

  // ─── Conversations ───────────────────────────────────────────────────────

  listConversations: () =>
    ipcRenderer.invoke('db:listConversations'),

  getConversation: (id: string) =>
    ipcRenderer.invoke('db:getConversation', id),

  createConversation: (data) =>
    ipcRenderer.invoke('db:createConversation', data),

  updateConversation: (id: string, data) =>
    ipcRenderer.invoke('db:updateConversation', id, data),

  deleteConversation: (id: string) =>
    ipcRenderer.invoke('db:deleteConversation', id),

  forkConversation: (conversationId: string, messageId: string) =>
    ipcRenderer.invoke('db:forkConversation', conversationId, messageId),

  // ─── Messages ────────────────────────────────────────────────────────────

  listMessages: (conversationId: string) =>
    ipcRenderer.invoke('db:listMessages', conversationId),

  createMessage: (data) =>
    ipcRenderer.invoke('db:createMessage', data),

  updateMessage: (id: string, data) =>
    ipcRenderer.invoke('db:updateMessage', id, data),

  deleteMessagesFrom: (conversationId: string, messageId: string) =>
    ipcRenderer.invoke('db:deleteMessagesFrom', conversationId, messageId),

  // ─── LLM Streaming ──────────────────────────────────────────────────────

  sendMessage: (request, onStream) => {
    // Generate a unique channel ID to prevent collisions between concurrent streams
    const channel = `llm:stream:${Date.now()}-${Math.random().toString(36).slice(2)}`

    const handler = (_event: Electron.IpcRendererEvent, chunk: unknown) => {
      onStream(chunk as Parameters<typeof onStream>[0])
    }

    ipcRenderer.on(channel, handler)
    ipcRenderer.invoke('llm:sendMessage', request, channel)

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, handler)
      ipcRenderer.invoke('llm:cancelStream', channel).catch(() => {
        // Stream may already be finished
      })
    }
  },

  listModels: (provider: string) =>
    ipcRenderer.invoke('llm:listModels', provider),

  // ─── Settings ────────────────────────────────────────────────────────────

  loadSettings: () =>
    ipcRenderer.invoke('settings:load'),

  saveSettings: (settings) =>
    ipcRenderer.invoke('settings:save', settings),

  // ─── Search ──────────────────────────────────────────────────────────────

  webSearch: (query: string, numResults?: number) =>
    ipcRenderer.invoke('search:web', query, numResults),

  // ─── Dialogs ─────────────────────────────────────────────────────────────

  showConfirmDialog: (options) =>
    ipcRenderer.invoke('dialog:confirm', options),

  openTextFile: () =>
    ipcRenderer.invoke('dialog:openTextFile'),

  openAttachmentFiles: () =>
    ipcRenderer.invoke('dialog:openAttachmentFiles')
}

contextBridge.exposeInMainWorld('redLedger', api)
