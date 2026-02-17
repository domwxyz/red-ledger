import { useRef, useEffect, useCallback } from 'react'
import { useConversationStore } from '@/store'
import { MessageBubble } from './MessageBubble'

/**
 * Adaptive near-bottom threshold:
 * - small chats can break away quickly (percentage of available scroll)
 * - long chats keep a modest sticky window near the bottom
 */
const NEAR_BOTTOM_RATIO = 0.20
const NEAR_BOTTOM_MIN_PX = 16
const NEAR_BOTTOM_MAX_PX = 96

interface MessageListProps {
  isStreaming: boolean
  isReceivingThinking: boolean
  onRetry: () => void
  onEdit: (content: string) => Promise<void>
}

export function MessageList({ isStreaming, isReceivingThinking, onRetry, onEdit }: MessageListProps) {
  const messages = useConversationStore((s) => s.messages)
  const isLoadingMessages = useConversationStore((s) => s.isLoadingMessages)
  const forkConversationFromMessage = useConversationStore((s) => s.forkConversationFromMessage)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

  const getNearBottomThresholdPx = useCallback((el: HTMLDivElement) => {
    const scrollableHeight = Math.max(0, el.scrollHeight - el.clientHeight)
    const adaptiveThreshold = scrollableHeight * NEAR_BOTTOM_RATIO
    return Math.max(NEAR_BOTTOM_MIN_PX, Math.min(NEAR_BOTTOM_MAX_PX, adaptiveThreshold))
  }, [])

  /** Check if the scroll container is near the bottom. */
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distanceFromBottom <= getNearBottomThresholdPx(el)
  }, [getNearBottomThresholdPx])

  const handleFork = useCallback(async (messageId: string) => {
    await forkConversationFromMessage(messageId)
  }, [forkConversationFromMessage])

  // Auto-scroll: only when a new message is added, or when the user is already near the bottom.
  useEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (messageCountChanged || isNearBottom()) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, isNearBottom])

  if (isLoadingMessages) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="loading loading-spinner loading-md text-rca-red" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-soft-charcoal/40">
          Send a message to begin the conversation
        </p>
      </div>
    )
  }

  // Find the last user message index - retry attaches there
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }

  // Show retry when idle and the latest message is persisted.
  // This includes failed turns where the last message is still the user message.
  const lastMessage = messages[messages.length - 1]
  const canRetry = !isStreaming
    && !!lastMessage
    && !lastMessage.id.startsWith('streaming-')
    && (lastMessage.role === 'assistant' || lastMessage.role === 'user')

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((message, idx) => {
        const messageIsStreaming = isStreaming && message.id.startsWith('streaming-')
        return (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={messageIsStreaming}
            isReceivingThinking={isReceivingThinking && messageIsStreaming}
            onRetry={canRetry && idx === lastUserIdx ? onRetry : undefined}
            onEdit={canRetry && idx === lastUserIdx ? onEdit : undefined}
            onFork={message.role === 'assistant' && !isStreaming
              ? () => { void handleFork(message.id).catch(() => {}) }
              : undefined}
          />
        )
      })}
    </div>
  )
}
