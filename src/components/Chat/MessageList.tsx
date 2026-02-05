import { useRef, useEffect } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { useConversationStore } from '@/store'
import { MessageBubble } from './MessageBubble'

export function MessageList() {
  const messages = useConversationStore((s) => s.messages)
  const isLoadingMessages = useConversationStore((s) => s.isLoadingMessages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [animateParent] = useAutoAnimate()

  // Auto-scroll to bottom on new messages or streaming content changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div ref={animateParent} className="h-full overflow-y-auto px-4 py-4 space-y-4">
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
