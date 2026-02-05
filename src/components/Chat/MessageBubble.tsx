import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Message, ToolCall } from '@/types'
import { cn } from '@/lib/utils'
import { ToolCallCard } from './ToolCallCard'

// Configure marked for GFM + line breaks
marked.setOptions({
  gfm: true,
  breaks: true
})

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  // Parse tool calls from JSON string if present
  const toolCalls = useMemo<ToolCall[]>(() => {
    if (!message.toolCalls) return []
    try {
      return JSON.parse(message.toolCalls)
    } catch {
      return []
    }
  }, [message.toolCalls])

  // Render assistant messages as markdown, user messages as plain text
  const renderedContent = useMemo(() => {
    if (message.role === 'user') return null // User messages use plain text rendering

    const rawHtml = marked.parse(message.content) as string
    const cleanHtml = DOMPurify.sanitize(rawHtml)
    return cleanHtml
  }, [message.content, message.role])

  if (message.role === 'system') return null // Don't render system messages

  return (
    <div className={cn(
      'flex flex-col gap-2',
      message.role === 'user' ? 'items-end' : 'items-start'
    )}>
      {/* Tool Call Cards (shown above assistant bubbles) */}
      {toolCalls.length > 0 && (
        <div className="space-y-2 max-w-[85%]">
          {toolCalls.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {/* Message Bubble */}
      <div className={cn(
        'message-bubble',
        message.role === 'user' ? 'user' : 'assistant'
      )}>
        {message.role === 'user' ? (
          <pre className="whitespace-pre-wrap font-sans text-sm m-0">{message.content}</pre>
        ) : (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedContent || '' }}
          />
        )}

        {/* Streaming cursor */}
        {isStreaming && message.role === 'assistant' && (
          <span className="streaming-cursor" />
        )}
      </div>
    </div>
  )
}
