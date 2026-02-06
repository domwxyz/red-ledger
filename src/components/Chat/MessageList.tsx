import { useRef, useEffect, useCallback } from 'react'
import { useConversationStore } from '@/store'
import { MessageBubble } from './MessageBubble'

/** Pixel threshold — if the user is within this distance of the bottom, auto-scroll continues. */
const NEAR_BOTTOM_PX = 150

export function MessageList() {
  const messages = useConversationStore((s) => s.messages)
  const isLoadingMessages = useConversationStore((s) => s.isLoadingMessages)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

  /** Check if the scroll container is near the bottom. */
  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }, [])

  // Auto-scroll: only when a new message is added, or when the user is already near the bottom.
  useEffect(() => {
    const messageCountChanged = messages.length !== prevMessageCountRef.current
    prevMessageCountRef.current = messages.length

    if (messageCountChanged || isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isStreaming={message.id.startsWith('streaming-')}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
