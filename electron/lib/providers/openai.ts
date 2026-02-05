import axios, { AxiosResponse } from 'axios'
import { BaseLLMProvider, type ProviderSendOptions, type AbortHandle, type ToolDefinition } from './base'
import type { StreamChunk, ToolCall } from '../../../src/types'

/**
 * OpenAI-compatible streaming provider.
 * Handles SSE (Server-Sent Events) format from /chat/completions with stream: true.
 * Also handles incremental tool_call deltas where arguments arrive as partial
 * JSON strings across multiple chunks.
 */
export class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com/v1') {
    super(apiKey, baseUrl)
  }

  sendStreaming(options: ProviderSendOptions): AbortHandle {
    const controller = new AbortController()

    this._stream(options, controller).catch((err) => {
      if (!controller.signal.aborted) {
        const message = err instanceof Error ? err.message : String(err)
        options.onChunk({ type: 'error', error: message })
      }
    })

    return { abort: () => controller.abort() }
  }

  private async _stream(options: ProviderSendOptions, controller: AbortController): Promise<void> {
    const { messages, model, tools, temperature, maxTokens, onChunk } = options

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      temperature: temperature ?? 0.7
    }

    if (maxTokens) {
      body.max_tokens = maxTokens
    }

    // Only include tools if there are any defined
    if (tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    let response: AxiosResponse

    try {
      response = await axios.post(`${this.baseUrl}/chat/completions`, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        responseType: 'stream',
        timeout: 120_000,
        signal: controller.signal
      })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // Try to extract API error message from the response body
        if (err.response?.data) {
          try {
            const chunks: Buffer[] = []
            for await (const chunk of err.response.data) {
              chunks.push(Buffer.from(chunk))
            }
            const errorBody = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
            const apiMessage = errorBody?.error?.message || JSON.stringify(errorBody)
            throw new Error(`API error (${err.response.status}): ${apiMessage}`)
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message.startsWith('API error')) {
              throw parseErr
            }
          }
        }
        throw new Error(`API error: ${err.message}`)
      }
      throw err
    }

    const stream = response.data as AsyncIterable<Buffer>

    // State for accumulating tool call deltas
    // OpenAI sends tool_calls in incremental delta chunks where the arguments
    // arrive as partial JSON strings across multiple SSE data lines.
    const pendingToolCalls: Map<number, {
      id: string
      name: string
      arguments: string
    }> = new Map()

    let buffer = ''

    for await (const chunk of stream) {
      if (controller.signal.aborted) break

      buffer += chunk.toString('utf-8')

      // Process complete SSE lines
      const lines = buffer.split('\n')
      // Keep the last potentially incomplete line
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()

        if (!trimmed || trimmed.startsWith(':')) continue // SSE comment or empty
        if (trimmed === 'data: [DONE]') {
          // Flush any remaining tool calls
          this._flushToolCalls(pendingToolCalls, onChunk)
          onChunk({ type: 'done' })
          return
        }

        if (!trimmed.startsWith('data: ')) continue

        try {
          const data = JSON.parse(trimmed.slice(6))
          const choice = data.choices?.[0]
          if (!choice) continue

          const delta = choice.delta

          // Text content
          if (delta?.content) {
            onChunk({ type: 'text', content: delta.content })
          }

          // Tool call deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0

              if (!pendingToolCalls.has(idx)) {
                // First delta for this tool call — has the id and function name
                pendingToolCalls.set(idx, {
                  id: tc.id || `tool_${idx}`,
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || ''
                })
              } else {
                // Subsequent delta — accumulate arguments
                const existing = pendingToolCalls.get(idx)!
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments
                }
                if (tc.function?.name) {
                  existing.name = tc.function.name
                }
              }
            }
          }

          // Check finish reason
          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
            if (pendingToolCalls.size > 0 && choice.finish_reason === 'tool_calls') {
              this._flushToolCalls(pendingToolCalls, onChunk)
            }
          }

        } catch {
          // Skip malformed SSE lines — this is common during streaming
        }
      }
    }

    // If we exited the loop without a [DONE], flush and finish
    if (!controller.signal.aborted) {
      this._flushToolCalls(pendingToolCalls, onChunk)
      onChunk({ type: 'done' })
    }
  }

  /**
   * Flush accumulated tool call deltas, emitting them as tool_call chunks.
   * Each pending tool call has its arguments parsed from the accumulated JSON string.
   */
  private _flushToolCalls(
    pending: Map<number, { id: string; name: string; arguments: string }>,
    onChunk: (chunk: StreamChunk) => void
  ): void {
    for (const [, tc] of pending) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = JSON.parse(tc.arguments)
      } catch {
        // If arguments don't parse, pass them as-is in a wrapper
        parsedArgs = { _raw: tc.arguments }
      }

      const toolCall: ToolCall = {
        id: tc.id,
        name: tc.name,
        arguments: parsedArgs
      }

      onChunk({ type: 'tool_call', toolCall })
    }
    pending.clear()
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 15_000
      })

      const models: string[] = (response.data?.data || [])
        .map((m: { id: string }) => m.id)
        .filter((id: string) => id.startsWith('gpt-'))
        .sort()

      return models
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Failed to list models: ${msg}`)
    }
  }
}
