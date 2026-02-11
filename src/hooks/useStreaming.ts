import { useState, useRef, useCallback } from 'react'
import { useConversationStore, useSettingsStore } from '@/store'
import { formatError } from '@/lib/errors'
import { notify } from '@/lib/notify'
import type { StreamChunk, ToolCall, LLMRequest, Message, Attachment } from '@/types'

const STREAM_THROTTLE_MS = 50
const THINKING_ACTIVE_WINDOW_MS = 1500

/**
 * React hook that manages the LLM streaming lifecycle.
 *
 * Flow: user sends message -> save to DB -> create temp assistant message ->
 * stream chunks into temp message -> on done, persist to DB and atomically
 * replace temp message with the saved version (no flash/gap).
 *
 * Streaming content updates are throttled to avoid excessive re-renders.
 */
export function useStreaming() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isReceivingThinking, setIsReceivingThinking] = useState(false)

  const cleanupRef = useRef<(() => void) | null>(null)
  const tempMessageIdRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const thinkingRef = useRef('')
  const toolCallsRef = useRef<ToolCall[]>([])
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const thinkingActivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearThinkingActivity = useCallback(() => {
    setIsReceivingThinking(false)
    if (thinkingActivityTimerRef.current) {
      clearTimeout(thinkingActivityTimerRef.current)
      thinkingActivityTimerRef.current = null
    }
  }, [])

  const markThinkingActivity = useCallback(() => {
    setIsReceivingThinking(true)
    if (thinkingActivityTimerRef.current) {
      clearTimeout(thinkingActivityTimerRef.current)
    }
    thinkingActivityTimerRef.current = setTimeout(() => {
      thinkingActivityTimerRef.current = null
      setIsReceivingThinking(false)
    }, THINKING_ACTIVE_WINDOW_MS)
  }, [])

  const cancel = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    if (throttleRef.current) {
      clearTimeout(throttleRef.current)
      throttleRef.current = null
    }
    if (tempMessageIdRef.current) {
      const tempId = tempMessageIdRef.current
      useConversationStore.setState((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId)
      }))
      tempMessageIdRef.current = null
    }
    setIsStreaming(false)
    clearThinkingActivity()
    contentRef.current = ''
    thinkingRef.current = ''
    toolCallsRef.current = []
  }, [clearThinkingActivity])

  const sendMessage = useCallback(async (content: string, attachments?: Attachment[]) => {
    const store = useConversationStore.getState()
    const conversationId = store.activeConversationId
    const currentSettings = useSettingsStore.getState().settings
    if (!conversationId || !currentSettings) return

    // Build the full message content, appending any attachments
    let fullContent = content
    if (attachments && attachments.length > 0) {
      const attachmentBlocks = attachments.map(
        (a) => `\n\n---\n**Attached file: ${a.name}**\n\`\`\`\n${a.content}\n\`\`\``
      )
      fullContent = content + attachmentBlocks.join('')
    }

    setIsStreaming(true)
    clearThinkingActivity()
    contentRef.current = ''
    thinkingRef.current = ''
    toolCallsRef.current = []

    try {
      // 1. Save user message to DB
      await store.addMessage({
        conversationId,
        role: 'user',
        content: fullContent
      })

      // 2. Build the message history for the LLM request
      const messages = useConversationStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      }))

      const request: LLMRequest = {
        conversationId,
        messages,
        model: currentSettings.defaultModel,
        provider: currentSettings.activeProvider,
        ...(currentSettings.temperatureEnabled ? { temperature: currentSettings.temperature } : {}),
        maxTokens: currentSettings.maxTokens
      }

      // 3. Create a placeholder assistant message in the store
      const tempId = `streaming-${Date.now()}`
      const tempMessage: Message = {
        id: tempId,
        conversationId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        createdAt: Date.now()
      }
      tempMessageIdRef.current = tempId
      useConversationStore.setState((state) => ({
        messages: [...state.messages, tempMessage]
      }))

      // Helper: flush accumulated content to the temp message in the store
      const flushToStore = () => {
        useConversationStore.getState().updateMessage(tempId, {
          content: contentRef.current,
          thinking: thinkingRef.current || undefined,
          toolCalls: toolCallsRef.current.length > 0
            ? JSON.stringify(toolCallsRef.current)
            : undefined
        })
      }

      // Helper: throttled store update for text chunks
      const scheduleFlush = () => {
        if (!throttleRef.current) {
          throttleRef.current = setTimeout(() => {
            throttleRef.current = null
            flushToStore()
          }, STREAM_THROTTLE_MS)
        }
      }

      // 4. Start the stream
      const cleanup = window.redLedger.sendMessage(request, (chunk: StreamChunk) => {
        switch (chunk.type) {
          case 'thinking': {
            thinkingRef.current += chunk.content || ''
            markThinkingActivity()
            scheduleFlush()
            break
          }

          case 'text': {
            contentRef.current += chunk.content || ''
            scheduleFlush()
            break
          }

          case 'tool_call': {
            if (chunk.toolCall) {
              // Stamp the current text length so the UI can interleave tool calls
              const stamped = { ...chunk.toolCall, contentOffset: contentRef.current.length }
              toolCallsRef.current = [...toolCallsRef.current, stamped]
              flushToStore()
            }
            break
          }

          case 'tool_result': {
            if (chunk.toolCall) {
              toolCallsRef.current = toolCallsRef.current.map((tc) =>
                tc.id === chunk.toolCall!.id
                  ? { ...chunk.toolCall!, contentOffset: tc.contentOffset }
                  : tc
              )
              flushToStore()
            }
            break
          }

          case 'error': {
            clearThinkingActivity()
            notify({
              type: 'error',
              message: chunk.error || 'Streaming error'
            })
            break
          }

          case 'done': {
            clearThinkingActivity()
            // Cancel any pending throttled flush
            if (throttleRef.current) {
              clearTimeout(throttleRef.current)
              throttleRef.current = null
            }

            const finalContent = contentRef.current
            const finalThinking = thinkingRef.current
            const finalToolCalls = toolCallsRef.current

            if (finalContent || finalThinking || finalToolCalls.length > 0) {
              // Persist to DB, then atomically replace the temp message
              window.redLedger.createMessage({
                conversationId,
                role: 'assistant',
                content: finalContent || '_(No text response)_',
                thinking: finalThinking || undefined,
                toolCalls: finalToolCalls.length > 0
                  ? JSON.stringify(finalToolCalls)
                  : undefined
              }).then((savedMsg) => {
                // Atomic swap: replace temp with persisted message (no flash)
                useConversationStore.setState((state) => ({
                  messages: state.messages.map((m) =>
                    m.id === tempId ? savedMsg : m
                  )
                }))
                tempMessageIdRef.current = null
              }).catch((err) => {
                notify({
                  type: 'error',
                  message: formatError(err)
                })
              })
            } else {
              // Nothing to save — remove the empty temp message
              useConversationStore.setState((state) => ({
                messages: state.messages.filter((m) => m.id !== tempId)
              }))
              tempMessageIdRef.current = null
            }

            setIsStreaming(false)
            contentRef.current = ''
            thinkingRef.current = ''
            toolCallsRef.current = []
            cleanupRef.current = null
            break
          }
        }
      })

      cleanupRef.current = cleanup

    } catch (err) {
      if (tempMessageIdRef.current) {
        const tempId = tempMessageIdRef.current
        useConversationStore.setState((state) => ({
          messages: state.messages.filter((m) => m.id !== tempId)
        }))
        tempMessageIdRef.current = null
      }
      setIsStreaming(false)
      clearThinkingActivity()
      notify({
        type: 'error',
        message: formatError(err)
      })
    }
  }, [clearThinkingActivity, markThinkingActivity])

  const retry = useCallback(async () => {
    if (isStreaming) return

    const store = useConversationStore.getState()
    const { messages } = store

    // Find the last user message
    let lastUserMsg: Message | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMsg = messages[i]
        break
      }
    }
    if (!lastUserMsg) return

    // Delete the user message and everything after it from DB + store
    await store.deleteMessagesFrom(lastUserMsg.id)

    // Re-send the same content (attachments are already baked into the content string)
    await sendMessage(lastUserMsg.content)
  }, [isStreaming, sendMessage])

  return {
    isStreaming,
    isReceivingThinking,
    sendMessage,
    cancel,
    retry
  }
}
