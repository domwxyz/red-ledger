import { useState, useRef, useCallback } from 'react'
import { useConversationStore, useSettingsStore, useUIStore } from '@/store'
import { formatError } from '@/lib/errors'
import type { StreamChunk, ToolCall, LLMRequest, Message } from '@/types'

/**
 * React hook that manages the LLM streaming lifecycle.
 *
 * - Maintains state: isStreaming, streamingContent, toolCalls
 * - sendMessage: adds user message to DB, starts IPC stream, accumulates chunks,
 *   on done saves assistant message to DB
 * - cancel: calls the cleanup function, resets state
 * - Uses a ref for the cleanup function to avoid stale closures
 * - Cleans up on unmount (via the cancel ref)
 */
export function useStreaming() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])

  const cleanupRef = useRef<(() => void) | null>(null)
  const contentRef = useRef('')
  const toolCallsRef = useRef<ToolCall[]>([])

  const addMessage = useConversationStore.getState().addMessage
  const updateMessage = useConversationStore.getState().updateMessage
  const settings = useSettingsStore.getState().settings

  const cancel = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    setIsStreaming(false)
    setStreamingContent('')
    setToolCalls([])
    contentRef.current = ''
    toolCallsRef.current = []
  }, [])

  const sendMessage = useCallback(async (content: string) => {
    const conversationId = useConversationStore.getState().activeConversationId
    const currentSettings = useSettingsStore.getState().settings
    if (!conversationId || !currentSettings) return

    // Reset state
    setIsStreaming(true)
    setStreamingContent('')
    setToolCalls([])
    contentRef.current = ''
    toolCallsRef.current = []

    try {
      // 1. Save user message to DB immediately
      await addMessage({
        conversationId,
        role: 'user',
        content
      })

      // 2. Build the message history for the LLM request
      const messages = useConversationStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.content
      }))

      const request: LLMRequest = {
        conversationId,
        messages,
        model: currentSettings.defaultModel,
        provider: currentSettings.activeProvider,
        temperature: currentSettings.temperature,
        maxTokens: currentSettings.maxTokens
      }

      // 3. Create a placeholder assistant message in the store (local optimistic)
      // We'll give it a temporary ID that gets replaced when we save to DB
      const tempAssistantId = `streaming-${Date.now()}`
      const tempMessage: Message = {
        id: tempAssistantId,
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: Date.now()
      }
      useConversationStore.setState((state) => ({
        messages: [...state.messages, tempMessage]
      }))

      // 4. Start the stream
      const cleanup = window.redLedger.sendMessage(request, (chunk: StreamChunk) => {
        switch (chunk.type) {
          case 'text': {
            contentRef.current += chunk.content || ''
            setStreamingContent(contentRef.current)

            // Update the temporary message in the store with accumulated content
            useConversationStore.getState().updateMessage(tempAssistantId, {
              content: contentRef.current
            })
            break
          }

          case 'tool_call': {
            if (chunk.toolCall) {
              toolCallsRef.current = [...toolCallsRef.current, chunk.toolCall]
              setToolCalls([...toolCallsRef.current])
            }
            break
          }

          case 'tool_result': {
            // Update the matching tool call with its result
            if (chunk.toolCall) {
              toolCallsRef.current = toolCallsRef.current.map((tc) =>
                tc.id === chunk.toolCall!.id ? chunk.toolCall! : tc
              )
              setToolCalls([...toolCallsRef.current])

              // Update the assistant message's toolCalls in the local store
              useConversationStore.getState().updateMessage(tempAssistantId, {
                toolCalls: JSON.stringify(toolCallsRef.current)
              })
            }
            break
          }

          case 'error': {
            useUIStore.getState().addToast({
              type: 'error',
              message: chunk.error || 'Streaming error'
            })
            break
          }

          case 'done': {
            // 5. Save the final assistant message to DB
            const finalContent = contentRef.current
            const finalToolCalls = toolCallsRef.current

            // Remove the temporary message from the store
            useConversationStore.setState((state) => ({
              messages: state.messages.filter((m) => m.id !== tempAssistantId)
            }))

            // Save to DB (this adds it back to the store via addMessage)
            if (finalContent || finalToolCalls.length > 0) {
              window.redLedger.createMessage({
                conversationId,
                role: 'assistant',
                content: finalContent || '_(No text response)_',
                toolCalls: finalToolCalls.length > 0
                  ? JSON.stringify(finalToolCalls)
                  : undefined
              }).then((savedMsg) => {
                // Add the saved message to the store
                useConversationStore.setState((state) => ({
                  messages: [...state.messages, savedMsg]
                }))
              }).catch((err) => {
                useUIStore.getState().addToast({
                  type: 'error',
                  message: formatError(err)
                })
              })
            }

            // Reset streaming state
            setIsStreaming(false)
            setStreamingContent('')
            setToolCalls([])
            contentRef.current = ''
            toolCallsRef.current = []
            cleanupRef.current = null
            break
          }
        }
      })

      cleanupRef.current = cleanup

    } catch (err) {
      setIsStreaming(false)
      useUIStore.getState().addToast({
        type: 'error',
        message: formatError(err)
      })
    }
  }, [addMessage])

  return {
    isStreaming,
    streamingContent,
    toolCalls,
    sendMessage,
    cancel
  }
}
