import { app, ipcMain, BrowserWindow } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getCurrentSettings } from './settings'
import { BaseLLMProvider, type LLMMessage, type AbortHandle } from '../lib/providers/base'
import { OpenAIProvider } from '../lib/providers/openai'
import { OpenRouterProvider } from '../lib/providers/openrouter'
import { OllamaProvider } from '../lib/providers/ollama'
import { TOOL_DEFINITIONS } from '../lib/tools/definitions'
import { executeTool } from '../lib/tools/executor'
import type { LLMRequest, StreamChunk, ToolCall, ProviderName } from '../../src/types'

const MAX_TOOL_ROUNDS = 10

// Active streams tracked by channel ID so they can be cancelled
const activeStreams = new Map<string, AbortHandle>()

// ─── Provider Factory ────────────────────────────────────────────────────────

function createProvider(providerName: ProviderName): BaseLLMProvider {
  const settings = getCurrentSettings()
  const config = settings.providers[providerName]

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(config.apiKey, config.baseUrl)
    case 'openrouter':
      return new OpenRouterProvider(config.apiKey, config.baseUrl)
    case 'ollama':
      return new OllamaProvider(config.apiKey, config.baseUrl)
    default:
      throw new Error(`Unknown provider: ${providerName}`)
  }
}

// ─── System Prompt Assembly ──────────────────────────────────────────────────

function assembleSystemPrompt(): string {
  const contextDir = getContextDir()
  const parts: string[] = []

  // System context
  const systemContent = readContextFile(join(contextDir, 'system.md'))
  if (systemContent) {
    parts.push(systemContent)
  }

  // User context
  const userContent = readContextFile(join(contextDir, 'user.md'))
  if (userContent && !isPlaceholderComment(userContent)) {
    parts.push(`\n## User Context\n${userContent}`)
  }

  // Org context
  const orgContent = readContextFile(join(contextDir, 'org.md'))
  if (orgContent && !isPlaceholderComment(orgContent)) {
    parts.push(`\n## Organization Context\n${orgContent}`)
  }

  return parts.join('\n') || 'You are a helpful assistant.'
}

function getContextDir(): string {
  return join(app.getPath('userData'), 'contexts')
}

function readContextFile(filePath: string): string {
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8').trim()
    }
  } catch {
    // ignore
  }
  return ''
}

/**
 * Check if content is only HTML comments (the default placeholder).
 * We skip these to avoid injecting empty sections into the system prompt.
 */
function isPlaceholderComment(content: string): boolean {
  return content.replace(/<!--[\s\S]*?-->/g, '').trim().length === 0
}

// ─── Stream Orchestration ────────────────────────────────────────────────────

/**
 * Main streaming orchestration loop.
 * Handles multi-round tool use: when the LLM makes tool calls, we execute
 * them, append the results to the conversation, and re-stream so the LLM
 * can respond to the tool output.
 */
async function orchestrateStream(
  request: LLMRequest,
  channel: string,
  win: BrowserWindow
): Promise<void> {
  const provider = createProvider(request.provider)
  const systemPrompt = assembleSystemPrompt()
  const settings = getCurrentSettings()

  // Build the conversation history in LLMMessage format
  const messages: LLMMessage[] = []

  // System message first
  messages.push({ role: 'system', content: systemPrompt })

  // Append conversation messages from the request
  for (const msg of request.messages) {
    messages.push({ role: msg.role, content: msg.content })
  }

  // Determine which tools to offer
  // Ollama without explicit tool support: still pass tools — newer versions handle it
  const tools = TOOL_DEFINITIONS

  let toolRound = 0

  while (toolRound < MAX_TOOL_ROUNDS) {
    // Collect chunks for this round
    const collectedToolCalls: ToolCall[] = []
    let textAccumulated = ''

    // Create a promise that resolves when the stream completes
    const streamDone = await new Promise<'done' | 'tool_calls' | 'error'>((resolve) => {
      const handle = provider.sendStreaming({
        messages,
        model: request.model,
        tools,
        temperature: request.temperature ?? settings.temperature,
        maxTokens: request.maxTokens ?? settings.maxTokens,
        onChunk: (chunk: StreamChunk) => {
          switch (chunk.type) {
            case 'text':
              textAccumulated += chunk.content || ''
              // Forward text to renderer immediately
              win.webContents.send(channel, chunk)
              break

            case 'tool_call':
              // Collect tool calls — they'll be executed after the stream round ends
              if (chunk.toolCall) {
                collectedToolCalls.push(chunk.toolCall)
              }
              // Forward to renderer so it can show the tool call card
              win.webContents.send(channel, chunk)
              break

            case 'error':
              win.webContents.send(channel, chunk)
              resolve('error')
              break

            case 'done':
              if (collectedToolCalls.length > 0) {
                resolve('tool_calls')
              } else {
                resolve('done')
              }
              break
          }
        }
      })

      // Track the abort handle
      activeStreams.set(channel, handle)
    })

    // Remove from active streams after this round
    activeStreams.delete(channel)

    if (streamDone === 'error' || streamDone === 'done') {
      // Terminal — send done if we haven't already
      if (streamDone === 'done') {
        win.webContents.send(channel, { type: 'done' } as StreamChunk)
      }
      return
    }

    // streamDone === 'tool_calls' — execute each tool and loop
    toolRound++

    // Append the assistant's response (with tool_calls) to the conversation
    const assistantMessage: LLMMessage = {
      role: 'assistant',
      content: textAccumulated || null,
      tool_calls: collectedToolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments)
        }
      }))
    }
    messages.push(assistantMessage)

    // Execute each tool call and collect results
    for (const tc of collectedToolCalls) {
      const executed = await executeTool(tc, win)

      // Send tool result chunk to renderer
      const resultChunk: StreamChunk = {
        type: 'tool_result',
        toolCall: executed
      }
      win.webContents.send(channel, resultChunk)

      // Append tool result to conversation for the next round
      const toolMessage: LLMMessage = {
        role: 'tool',
        content: JSON.stringify(executed.result),
        tool_call_id: tc.id
      }
      messages.push(toolMessage)
    }

    // Reset accumulated text for next round
    textAccumulated = ''

    // Loop — the provider will be called again with the tool results appended
  }

  // Exceeded max tool rounds
  const errorChunk: StreamChunk = {
    type: 'error',
    error: `Maximum tool rounds (${MAX_TOOL_ROUNDS}) exceeded. The assistant may be stuck in a loop.`
  }
  win.webContents.send(channel, errorChunk)
  win.webContents.send(channel, { type: 'done' } as StreamChunk)
}

// ─── IPC Registration ────────────────────────────────────────────────────────

export function registerLlmHandlers(win: BrowserWindow): void {
  ipcMain.handle('llm:sendMessage', async (_event, request: LLMRequest, channel: string) => {
    try {
      await orchestrateStream(request, channel, win)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const errorChunk: StreamChunk = { type: 'error', error: message }
      win.webContents.send(channel, errorChunk)
      win.webContents.send(channel, { type: 'done' } as StreamChunk)
    }
  })

  ipcMain.handle('llm:cancelStream', async (_event, channel: string) => {
    const handle = activeStreams.get(channel)
    if (handle) {
      handle.abort()
      activeStreams.delete(channel)
    }
  })

  ipcMain.handle('llm:listModels', async (_event, providerName: string) => {
    const provider = createProvider(providerName as ProviderName)
    return provider.listModels()
  })
}
