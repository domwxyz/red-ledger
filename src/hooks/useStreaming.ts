import { useState, useRef, useCallback, useEffect } from 'react'
import { useConversationStore, useSettingsStore, useUIStore } from '@/store'
import { formatError } from '@/lib/errors'
import { notify } from '@/lib/notify'
import type { StreamChunk, ToolCall, LLMRequest, Message, Attachment } from '@/types'

const STREAM_THROTTLE_MS = 50
const THINKING_ACTIVE_WINDOW_MS = 1500
const THINKING_BLOCK_SEPARATOR = '\n\n---\n\n'

function findLastUserMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i]
    }
  }
  return undefined
}

/**
 * React hook that manages the LLM streaming lifecycle.
 *
 * Flow: user sends message -> save to DB -> create temp assistant message ->
 * stream chunks into temp message -> on done/cancel, persist to DB and
 * atomically replace temp message with the saved version (no flash/gap).
 *
 * Streaming content updates are throttled to avoid excessive re-renders.
 */
export function useStreaming() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isReceivingThinking, setIsReceivingThinking] = useState(false)

  const cleanupRef = useRef<(() => void) | null>(null)
  const tempMessageIdRef = useRef<string | null>(null)
  const tempConversationIdRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const thinkingRef = useRef('')
  const toolCallsRef = useRef<ToolCall[]>([])
  const lastStreamChunkTypeRef = useRef<StreamChunk['type'] | null>(null)
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

  const finalizeTempMessage = useCallback((tempId: string, conversationId: string) => {
    const finalContent = contentRef.current
    const finalThinking = thinkingRef.current
    const finalToolCalls = toolCallsRef.current
    const hasAnyOutput = Boolean(finalContent || finalThinking || finalToolCalls.length > 0)

    const clearTempRefsIfCurrent = () => {
      if (tempMessageIdRef.current === tempId) {
        tempMessageIdRef.current = null
      }
      if (tempConversationIdRef.current === conversationId) {
        tempConversationIdRef.current = null
      }
    }

    if (!hasAnyOutput) {
      useConversationStore.setState((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId)
      }))
      clearTempRefsIfCurrent()
      return
    }

    // Ensure the latest buffered state is visible before persistence swap.
    useConversationStore.getState().updateMessage(tempId, {
      content: finalContent,
      thinking: finalThinking || undefined,
      toolCalls: finalToolCalls.length > 0
        ? JSON.stringify(finalToolCalls)
        : undefined
    })

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
      useConversationStore.getState().touchConversation(conversationId, savedMsg.createdAt)
      clearTempRefsIfCurrent()
    }).catch((err) => {
      notify({
        type: 'error',
        message: formatError(err)
      })
    })
  }, [])

  const cancel = useCallback(() => {
    const tempId = tempMessageIdRef.current
    const tempConversationId = tempConversationIdRef.current

    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    if (throttleRef.current) {
      clearTimeout(throttleRef.current)
      throttleRef.current = null
    }

    if (tempId && tempConversationId) {
      finalizeTempMessage(tempId, tempConversationId)
    } else if (tempId) {
      useConversationStore.setState((state) => ({
        messages: state.messages.filter((m) => m.id !== tempId)
      }))
      tempMessageIdRef.current = null
      tempConversationIdRef.current = null
    }

    setIsStreaming(false)
    clearThinkingActivity()
    contentRef.current = ''
    thinkingRef.current = ''
    toolCallsRef.current = []
    lastStreamChunkTypeRef.current = null
  }, [clearThinkingActivity, finalizeTempMessage])

  const sendMessage = useCallback(async (content: string, attachments?: Attachment[]) => {
    const store = useConversationStore.getState()
    const conversationId = store.activeConversationId
    const activeConversation = store.conversations.find((c) => c.id === conversationId) || null
    const currentSettings = useSettingsStore.getState().settings
    if (!conversationId || !currentSettings) return
    const workspacePath = useUIStore.getState().workspacePath

    setIsStreaming(true)
    clearThinkingActivity()
    contentRef.current = ''
    thinkingRef.current = ''
    toolCallsRef.current = []
    lastStreamChunkTypeRef.current = null

    try {
      const configuredProvider = currentSettings.activeProvider
      const configuredModel = currentSettings.providers[configuredProvider].selectedModel
        ?? currentSettings.defaultModel
      let isFirstMessage = store.messages.length === 0
      if (isFirstMessage) {
        const persistedMessages = await window.redLedger.listMessages(conversationId)
        isFirstMessage = persistedMessages.length === 0
      }

      const lockedProvider = isFirstMessage
        ? configuredProvider
        : (activeConversation?.provider || configuredProvider)
      const lockedModel = isFirstMessage
        ? configuredModel
        : (activeConversation?.model || configuredModel)

      if (isFirstMessage) {
        await window.redLedger.updateConversation(conversationId, {
          provider: lockedProvider,
          model: lockedModel,
          workspacePath
        })

        useConversationStore.setState((state) => ({
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                ...conversation,
                provider: lockedProvider,
                model: lockedModel,
                workspacePath
              }
              : conversation
          )
        }))
      }

      // 1. Save user message to DB
      await store.addMessage({
        conversationId,
        role: 'user',
        content,
        attachments
      })

      // 2. Build the message history for the LLM request
      const messages = useConversationStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        ...(m.role === 'user' && m.attachments && m.attachments.length > 0
          ? { attachments: m.attachments }
          : {})
      }))

      const request: LLMRequest = {
        conversationId,
        messages,
        model: lockedModel,
        provider: lockedProvider,
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
      tempConversationIdRef.current = conversationId
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
            const incomingThinking = chunk.content || ''
            const isResumedThinking = Boolean(
              incomingThinking &&
              thinkingRef.current &&
              lastStreamChunkTypeRef.current &&
              lastStreamChunkTypeRef.current !== 'thinking'
            )
            if (isResumedThinking) {
              thinkingRef.current += THINKING_BLOCK_SEPARATOR
            }
            thinkingRef.current += incomingThinking
            markThinkingActivity()
            scheduleFlush()
            lastStreamChunkTypeRef.current = 'thinking'
            break
          }

          case 'text': {
            contentRef.current += chunk.content || ''
            scheduleFlush()
            lastStreamChunkTypeRef.current = 'text'
            break
          }

          case 'tool_call': {
            if (chunk.toolCall) {
              // Stamp the current text length so the UI can interleave tool calls
              const stamped = { ...chunk.toolCall, contentOffset: contentRef.current.length }
              toolCallsRef.current = [...toolCallsRef.current, stamped]
              flushToStore()
            }
            lastStreamChunkTypeRef.current = 'tool_call'
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
            lastStreamChunkTypeRef.current = 'tool_result'
            break
          }

          case 'error': {
            clearThinkingActivity()
            notify({
              type: 'error',
              message: chunk.error || 'Streaming error'
            })
            lastStreamChunkTypeRef.current = 'error'
            break
          }

          case 'done': {
            clearThinkingActivity()
            // Cancel any pending throttled flush
            if (throttleRef.current) {
              clearTimeout(throttleRef.current)
              throttleRef.current = null
            }

            cleanup()
            finalizeTempMessage(tempId, conversationId)

            setIsStreaming(false)
            contentRef.current = ''
            thinkingRef.current = ''
            toolCallsRef.current = []
            lastStreamChunkTypeRef.current = null
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
        tempConversationIdRef.current = null
      }
      setIsStreaming(false)
      clearThinkingActivity()
      lastStreamChunkTypeRef.current = null
      notify({
        type: 'error',
        message: formatError(err)
      })
    }
  }, [clearThinkingActivity, finalizeTempMessage, markThinkingActivity])

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
        throttleRef.current = null
      }
      if (thinkingActivityTimerRef.current) {
        clearTimeout(thinkingActivityTimerRef.current)
        thinkingActivityTimerRef.current = null
      }
    }
  }, [])

  const retry = useCallback(async () => {
    if (isStreaming) return

    const store = useConversationStore.getState()
    const lastUserMsg = findLastUserMessage(store.messages)
    if (!lastUserMsg) return

    // Delete the user message and everything after it from DB + store
    await store.deleteMessagesFrom(lastUserMsg.id)

    await sendMessage(lastUserMsg.content, lastUserMsg.attachments)
  }, [isStreaming, sendMessage])

  const editLastUserMessage = useCallback(async (content: string) => {
    if (isStreaming) return

    const store = useConversationStore.getState()
    const lastUserMsg = findLastUserMessage(store.messages)
    if (!lastUserMsg) return

    const nextContent = content.trim()
    const hasAttachments = Boolean(lastUserMsg.attachments && lastUserMsg.attachments.length > 0)
    if (!nextContent && !hasAttachments) return

    await store.deleteMessagesFrom(lastUserMsg.id)
    await sendMessage(nextContent, lastUserMsg.attachments)
  }, [isStreaming, sendMessage])

  return {
    isStreaming,
    isReceivingThinking,
    sendMessage,
    cancel,
    retry,
    editLastUserMessage
  }
}
