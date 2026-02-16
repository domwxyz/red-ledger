import type { StreamChunk } from '../../../src/types'

/**
 * Tool definition in OpenAI function-calling format.
 * All providers receive tools in this shape; non-supporting providers
 * (e.g. Ollama without tool support) simply ignore them.
 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required: string[]
    }
  }
}

/**
 * A single message in the LLM conversation history.
 * Extends beyond the renderer's simple {role, content} to include
 * the tool_calls / tool_call_id fields needed for multi-round tool use.
 */
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: LLMMessageContent | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string // JSON string
    }
  }>
  tool_call_id?: string
}

export interface LLMTextContentPart {
  type: 'text'
  text: string
}

export interface LLMImageUrlContentPart {
  type: 'image_url'
  image_url: {
    url: string
  }
}

export type LLMMessageContent =
  | string
  | Array<LLMTextContentPart | LLMImageUrlContentPart>

export interface ProviderSendOptions {
  messages: LLMMessage[]
  model: string
  tools: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  extraBody?: Record<string, unknown>
  onChunk: (chunk: StreamChunk) => void
}

export interface AbortHandle {
  abort: () => void
}

/**
 * Abstract base class for all LLM providers.
 * Subclasses implement streaming and model listing
 * for their specific API format.
 */
export abstract class BaseLLMProvider {
  protected apiKey: string
  protected baseUrl: string

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '') // trim trailing slashes
  }

  /**
   * Start a streaming completion request.
   * Returns an AbortHandle that can cancel the in-flight request.
   * Chunks are delivered via the onChunk callback.
   * The implementation MUST send a final { type: 'done' } chunk
   * when the stream completes normally.
   */
  abstract sendStreaming(options: ProviderSendOptions): AbortHandle

  /**
   * Fetch the list of available models from this provider.
   */
  abstract listModels(): Promise<string[]>
}
