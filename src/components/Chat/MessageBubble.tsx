import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Paperclip } from 'lucide-react'
import type { Message, ToolCall } from '@/types'
import { ToolCallCard } from './ToolCallCard'
import {
  MessageActionsBar,
  useCopyAction,
  retryAction,
  type MessageAction
} from './MessageActions'

// Configure marked for GFM + line breaks
marked.setOptions({
  gfm: true,
  breaks: true
})

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  /** If provided, a retry button is shown in the action bar. */
  onRetry?: () => void
}

/** A renderable segment: either a block of text or a tool call. */
type Segment =
  | { kind: 'text'; text: string; html: string }
  | { kind: 'tool'; toolCall: ToolCall }

/**
 * Build an interleaved list of text segments and tool call cards.
 *
 * Each ToolCall may carry a `contentOffset` indicating where in the full
 * `content` string the tool call was initiated. We split the text at those
 * boundaries so tool calls appear *between* the prose they interrupted.
 *
 * Backward-compatible: tool calls without `contentOffset` are grouped at the top.
 */
function buildSegments(content: string, toolCalls: ToolCall[]): Segment[] {
  if (toolCalls.length === 0) {
    // No tool calls — just one text block
    if (!content) return []
    const html = DOMPurify.sanitize(marked.parse(content) as string)
    return [{ kind: 'text', text: content, html }]
  }

  // Separate tool calls with offsets from legacy ones (no offset)
  const withOffset = toolCalls.filter((tc) => tc.contentOffset !== undefined)
  const legacy = toolCalls.filter((tc) => tc.contentOffset === undefined)

  // If none have offsets, fall back to old behavior: all tool calls then text
  if (withOffset.length === 0) {
    const segments: Segment[] = legacy.map((tc) => ({ kind: 'tool', toolCall: tc }))
    if (content) {
      const html = DOMPurify.sanitize(marked.parse(content) as string)
      segments.push({ kind: 'text', text: content, html })
    }
    return segments
  }

  // Sort by offset
  const sorted = [...withOffset].sort((a, b) => a.contentOffset! - b.contentOffset!)

  const segments: Segment[] = []

  // Legacy tool calls first (if any)
  for (const tc of legacy) {
    segments.push({ kind: 'tool', toolCall: tc })
  }

  let cursor = 0
  for (const tc of sorted) {
    const offset = tc.contentOffset!
    // Text before this tool call
    if (offset > cursor) {
      const slice = content.slice(cursor, offset)
      if (slice.trim()) {
        const html = DOMPurify.sanitize(marked.parse(slice) as string)
        segments.push({ kind: 'text', text: slice, html })
      }
    }
    segments.push({ kind: 'tool', toolCall: tc })
    cursor = offset
  }

  // Remaining text after the last tool call
  if (cursor < content.length) {
    const slice = content.slice(cursor)
    if (slice.trim()) {
      const html = DOMPurify.sanitize(marked.parse(slice) as string)
      segments.push({ kind: 'text', text: slice, html })
    }
  }

  return segments
}

/** Extract user-visible text from a user message (strips attachment blocks). */
function extractUserText(content: string): string {
  const separator = '\n\n---\n**Attached file: '
  const idx = content.indexOf(separator)
  return idx === -1 ? content : content.slice(0, idx)
}

export function MessageBubble({ message, isStreaming, onRetry }: MessageBubbleProps) {
  // Parse tool calls from JSON string if present
  const toolCalls = useMemo<ToolCall[]>(() => {
    if (!message.toolCalls) return []
    try {
      return JSON.parse(message.toolCalls)
    } catch {
      return []
    }
  }, [message.toolCalls])

  // ─── Actions ───────────────────────────────────────────────────────────────

  // Copy action: for user messages copy the user text only; for assistant copy raw content
  const copyText = message.role === 'user'
    ? extractUserText(message.content)
    : message.content
  const copyAction = useCopyAction(copyText)

  const actions = useMemo<MessageAction[]>(() => {
    // Don't show actions during streaming or for system messages
    if (isStreaming || message.role === 'system') return []

    const list: MessageAction[] = []
    if (onRetry) list.push(retryAction(onRetry))
    list.push(copyAction)
    return list
  }, [copyAction, onRetry, isStreaming, message.role])

  // Parse user message: separate text from attachment blocks
  const userParts = useMemo(() => {
    if (message.role !== 'user') return null
    const separator = '\n\n---\n**Attached file: '
    const idx = message.content.indexOf(separator)
    if (idx === -1) return { text: message.content, attachments: [] }

    const text = message.content.slice(0, idx)
    const rest = message.content.slice(idx)
    // Match each attachment block
    const attachmentRegex = /\n\n---\n\*\*Attached file: (.+?)\*\*\n```\n([\s\S]*?)\n```/g
    const attachments: { name: string; content: string }[] = []
    let match
    while ((match = attachmentRegex.exec(rest)) !== null) {
      attachments.push({ name: match[1], content: match[2] })
    }
    return { text, attachments }
  }, [message.content, message.role])

  // ─── Assistant Message ─────────────────────────────────────────────────────

  const segments = useMemo(
    () => buildSegments(message.content, toolCalls),
    [message.content, toolCalls]
  )

  const align = message.role === 'user' ? 'right' : 'left'

  if (message.role === 'system') return null // Don't render system messages

  // ─── User Message ──────────────────────────────────────────────────────────

  if (message.role === 'user') {
    const { text, attachments } = userParts!
    return (
      <div className="message-row group flex flex-col items-end">
        <div className="message-bubble user">
          {text && text !== '(see attached files)' && (
            <pre className="whitespace-pre-wrap font-sans text-sm m-0">{text}</pre>
          )}
          {attachments.length > 0 && (
            <div className={`flex flex-col gap-1 ${text && text !== '(see attached files)' ? 'mt-2' : ''}`}>
              {attachments.map((a, i) => (
                <details key={i} className="group/attach">
                  <summary className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-soft-charcoal/60 hover:text-soft-charcoal select-none list-none [&::-webkit-details-marker]:hidden">
                    <Paperclip size={11} className="shrink-0" />
                    <span>{a.name}</span>
                    <span className="text-[10px] opacity-50 group-open/attach:rotate-90 transition-transform">&#9654;</span>
                  </summary>
                  <pre className="whitespace-pre-wrap font-mono text-xs mt-1 p-2 bg-black/5 rounded max-h-[200px] overflow-y-auto m-0">{a.content}</pre>
                </details>
              ))}
            </div>
          )}
        </div>
        <MessageActionsBar actions={actions} align={align} />
      </div>
    )
  }

  // Determine if the last segment is a text segment (for streaming cursor placement)
  const lastSegment = segments[segments.length - 1]
  const lastSegmentIsText = lastSegment?.kind === 'text'

  return (
    <div className="message-row group flex flex-col gap-2 items-start">
      {segments.map((seg, i) => {
        if (seg.kind === 'tool') {
          return (
            <div key={seg.toolCall.id} className="max-w-[85%]">
              <ToolCallCard toolCall={seg.toolCall} />
            </div>
          )
        }

        // Text segment
        const isLastTextSegment = i === segments.length - 1 && seg.kind === 'text'
        return (
          <div
            key={`text-${i}`}
            className="message-bubble assistant"
          >
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: seg.html }}
            />
            {/* Streaming cursor — only on the very last text segment */}
            {isStreaming && isLastTextSegment && (
              <span className="streaming-cursor" />
            )}
          </div>
        )
      })}

      {/* If streaming and the last segment is a tool call (text hasn't resumed yet),
          show cursor in a minimal bubble so the user sees activity */}
      {isStreaming && !lastSegmentIsText && segments.length > 0 && (
        <div className="message-bubble assistant">
          <span className="streaming-cursor" />
        </div>
      )}

      {/* If streaming but no segments yet (very start), show cursor */}
      {isStreaming && segments.length === 0 && (
        <div className="message-bubble assistant">
          <span className="streaming-cursor" />
        </div>
      )}

      <MessageActionsBar actions={actions} align={align} />
    </div>
  )
}
