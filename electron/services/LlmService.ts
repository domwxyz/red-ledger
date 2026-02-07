import type { LLMMessage, AbortHandle } from '../lib/providers/base'
import { createProvider } from '../lib/providers/registry'
import { getToolDefinitions } from '../lib/tools/registry'
import type { LLMRequest, StreamChunk, ToolCall, ProviderName, Settings } from '../../src/types'

// Side-effect imports: each provider self-registers when loaded
import '../lib/providers/openai'
import '../lib/providers/openrouter'
import '../lib/providers/ollama'

const MAX_TOOL_ROUNDS = 10

/**
 * Interface for sending stream chunks to the renderer.
 * In production: wraps win.webContents.send(channel, chunk).
 * In tests: a mock.
 */
export interface StreamSink {
  send(chunk: StreamChunk): void
}

/**
 * Domain service for LLM streaming orchestration.
 * Owns provider factory, multi-round tool use loop, and system prompt assembly.
 * No Electron imports — dialogs and window access are injected.
 */
export class LlmService {
  private getSettings: () => Settings
  private getSystemPrompt: () => string
  private activeStreams = new Map<string, AbortHandle>()

  constructor(deps: {
    getSettings: () => Settings
    getSystemPrompt: () => string
  }) {
    this.getSettings = deps.getSettings
    this.getSystemPrompt = deps.getSystemPrompt
  }

  /**
   * Main streaming orchestration loop.
   * Handles multi-round tool use: when the LLM makes tool calls, we execute
   * them, append the results to the conversation, and re-stream so the LLM
   * can respond to the tool output.
   */
  async orchestrateStream(
    request: LLMRequest,
    channel: string,
    sink: StreamSink,
    toolExecutor: (tc: ToolCall) => Promise<ToolCall>
  ): Promise<void> {
    const provider = this.createProvider(request.provider)
    const systemPrompt = this.getSystemPrompt()
    const settings = this.getSettings()

    // Build the conversation history in LLMMessage format
    const messages: LLMMessage[] = []

    // System message first
    messages.push({ role: 'system', content: systemPrompt })

    // Append conversation messages from the request, injecting system timestamps
    // into user messages so the LLM always has accurate real-time context
    for (const msg of request.messages) {
      if (msg.role === 'user' && msg.timestamp) {
        const timestampTag = `[system: msg_timestamp=${msg.timestamp}]\n\n`
        messages.push({ role: msg.role, content: timestampTag + msg.content })
      } else {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    const tools = getToolDefinitions()

    let toolRound = 0

    while (toolRound < MAX_TOOL_ROUNDS) {
      const collectedToolCalls: ToolCall[] = []
      let textAccumulated = ''

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
                sink.send(chunk)
                break

              case 'tool_call':
                if (chunk.toolCall) {
                  collectedToolCalls.push(chunk.toolCall)
                }
                sink.send(chunk)
                break

              case 'error':
                sink.send(chunk)
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
        this.activeStreams.set(channel, handle)
      })

      // Remove from active streams after this round
      this.activeStreams.delete(channel)

      if (streamDone === 'error' || streamDone === 'done') {
        if (streamDone === 'done') {
          sink.send({ type: 'done' })
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
        const executed = await toolExecutor(tc)

        // Send tool result chunk to renderer
        sink.send({ type: 'tool_result', toolCall: executed })

        // Append tool result to conversation for the next round
        const toolMessage: LLMMessage = {
          role: 'tool',
          content: JSON.stringify(executed.result),
          tool_call_id: tc.id
        }
        messages.push(toolMessage)
      }

      textAccumulated = ''
    }

    // Exceeded max tool rounds
    sink.send({
      type: 'error',
      error: `Maximum tool rounds (${MAX_TOOL_ROUNDS}) exceeded. The assistant may be stuck in a loop.`
    })
    sink.send({ type: 'done' })
  }

  cancelStream(channel: string): void {
    const handle = this.activeStreams.get(channel)
    if (handle) {
      handle.abort()
      this.activeStreams.delete(channel)
    }
  }

  async listModels(providerName: ProviderName): Promise<string[]> {
    const provider = this.createProvider(providerName)
    return provider.listModels()
  }

  // ─── Provider Factory ─────────────────────────────────────────────────────

  private createProvider(providerName: ProviderName) {
    const settings = this.getSettings()
    const config = settings.providers[providerName]
    return createProvider(providerName, config.apiKey, config.baseUrl)
  }
}
