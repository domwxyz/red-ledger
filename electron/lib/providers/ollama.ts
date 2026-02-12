import axios from 'axios'
import { BaseLLMProvider, type ProviderSendOptions, type AbortHandle } from './base'
import { registerProvider } from './registry'

function extractThinking(value: unknown): string {
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value
      .map((item) => extractThinking(item))
      .join('')
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return extractThinking(record.text || record.content)
  }

  return ''
}

/**
 * Ollama provider - local LLM server.
 * Uses NDJSON streaming (one JSON object per line) instead of SSE.
 * No API key required. Longer timeout (300s) because first model load can be slow.
 * Tool use support depends on the specific Ollama model; we include tools when
 * definitions are provided but gracefully handle models that ignore them.
 */
export class OllamaProvider extends BaseLLMProvider {
  constructor(apiKey: string = '', baseUrl: string = 'http://localhost:11434') {
    super(apiKey, baseUrl)
  }

  sendStreaming(options: ProviderSendOptions): AbortHandle {
    const controller = new AbortController()

    this._stream(options, controller).catch((err) => {
      if (!controller.signal.aborted) {
        let message = err instanceof Error ? err.message : String(err)

        // User-friendly message for connection refused
        if (message.includes('ECONNREFUSED')) {
          message = 'Cannot reach Ollama. Is it running? (ollama serve)'
        }

        options.onChunk({ type: 'error', error: message })
      } else {
        // Ensure orchestrators waiting on chunks always receive a terminal signal.
        options.onChunk({ type: 'done' })
      }
    })

    return { abort: () => controller.abort() }
  }

  private async _stream(options: ProviderSendOptions, controller: AbortController): Promise<void> {
    const { messages, model, tools, temperature, onChunk } = options

    // Convert messages to Ollama format
    // Ollama uses the same role/content structure but uses 'tool' role differently
    const ollamaMessages = messages.map((m) => {
      if (m.role === 'tool') {
        // Ollama wants tool responses as role: 'tool' with content
        return { role: 'tool' as const, content: m.content || '' }
      }
      return { role: m.role, content: m.content || '' }
    })

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: temperature ?? 0.7
      }
    }

    // Include tools if any are defined — newer Ollama versions support this
    if (tools.length > 0) {
      body.tools = tools
    }

    const response = await axios.post(`${this.baseUrl}/api/chat`, body, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'stream',
      timeout: 300_000,
      signal: controller.signal
    })

    const stream = response.data as AsyncIterable<Buffer>
    let buffer = ''

    for await (const chunk of stream) {
      if (controller.signal.aborted) break

      buffer += chunk.toString('utf-8')

      // Ollama sends NDJSON — one JSON object per line
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // keep last incomplete line

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const data = JSON.parse(trimmed)

          const thinking = extractThinking(data.message?.thinking)
          if (thinking) {
            onChunk({ type: 'thinking', content: thinking })
          }

          // Text content
          if (data.message?.content) {
            onChunk({ type: 'text', content: data.message.content })
          }

          // Tool calls (if supported by the model)
          if (data.message?.tool_calls) {
            for (const tc of data.message.tool_calls) {
              onChunk({
                type: 'tool_call',
                toolCall: {
                  id: tc.function?.name || `ollama_tool_${Date.now()}`,
                  name: tc.function?.name || 'unknown',
                  arguments: tc.function?.arguments || {}
                }
              })
            }
          }

          // Stream complete
          if (data.done === true) {
            onChunk({ type: 'done' })
            return
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }

    // If we exited the loop without done=true, send done anyway.
    onChunk({ type: 'done' })
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 10_000
      })

      const models: string[] = (response.data?.models || [])
        .map((m: { name: string }) => m.name)
        .sort()

      return models
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('ECONNREFUSED')) {
        throw new Error('Cannot reach Ollama. Is it running? (ollama serve)')
      }
      throw new Error(`Failed to list Ollama models: ${msg}`)
    }
  }
}

registerProvider({
  name: 'ollama',
  displayName: 'Ollama',
  defaultBaseUrl: 'http://localhost:11434',
  factory: (settings) => new OllamaProvider(settings.apiKey, settings.baseUrl)
})
