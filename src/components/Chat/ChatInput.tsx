import { useState, useRef, useCallback } from 'react'
import { Send, Square, Paperclip, X } from 'lucide-react'
import { useConversationStore, useSettingsStore } from '@/store'
import type { useStreaming } from '@/hooks/useStreaming'
import type { Attachment } from '@/types'

interface ChatInputProps {
  streaming: ReturnType<typeof useStreaming>
}

export function ChatInput({ streaming }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const settings = useSettingsStore((s) => s.settings)
  const { isStreaming, sendMessage, cancel } = streaming

  const handleAttach = useCallback(async () => {
    const files = await window.redLedger.openAttachmentFiles()
    if (files.length > 0) {
      setAttachments((prev) => [...prev, ...files])
    }
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if ((!content && attachments.length === 0) || !activeConversationId || isStreaming) return

    const pending = attachments.length > 0 ? [...attachments] : undefined
    setInput('')
    setAttachments([])
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    await sendMessage(content || '(see attached files)', pending)
  }, [input, attachments, activeConversationId, isStreaming, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-grow textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }

  const isDisabled = !activeConversationId || !settings

  return (
    <div className="border-t border-weathered bg-paper-stack/30 px-4 py-3">
      {/* Attachment pills */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-weathered rounded text-xs text-soft-charcoal"
            >
              <Paperclip size={10} className="shrink-0 text-soft-charcoal/40" />
              <span className="truncate max-w-[150px]">{a.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="ml-0.5 hover:text-rca-red transition-colors"
                title="Remove"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled
              ? 'Select a conversation...'
              : isStreaming
                ? 'Waiting for response...'
                : 'Type a message... (Enter to send)'
          }
          disabled={isDisabled || isStreaming}
          rows={1}
          className="textarea textarea-bordered flex-1 bg-white resize-none text-sm min-h-[40px] max-h-[200px] leading-relaxed focus:outline-none focus:border-weathered"
        />

        {isStreaming ? (
          <button
            onClick={cancel}
            className="btn btn-error btn-sm h-10 w-10 min-w-[40px] p-0 shrink-0"
            title="Cancel"
          >
            <Square size={14} />
          </button>
        ) : (
          <>
            <button
              onClick={handleAttach}
              disabled={isDisabled}
              className="btn btn-ghost btn-sm h-10 w-10 min-w-[40px] p-0 shrink-0 text-soft-charcoal/50 hover:text-soft-charcoal"
              title="Attach .txt, .md, or .pdf files"
            >
              <Paperclip size={16} />
            </button>
            <button
              onClick={handleSend}
              disabled={isDisabled || (!input.trim() && attachments.length === 0)}
              className="btn btn-primary btn-sm h-10 w-10 min-w-[40px] p-0 shrink-0"
              title="Send"
            >
              <Send size={16} />
            </button>
          </>
        )}
      </div>

      {isStreaming && (
        <div className="flex items-center gap-2 mt-2 text-xs text-soft-charcoal/40">
          <span className="loading loading-dots loading-xs text-rca-red" />
          <span>Generating response...</span>
        </div>
      )}
    </div>
  )
}
