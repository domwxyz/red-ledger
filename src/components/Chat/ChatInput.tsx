import { useState, useRef, useCallback } from 'react'
import { Send, Square } from 'lucide-react'
import { useConversationStore, useSettingsStore } from '@/store'
import { useStreaming } from '@/hooks/useStreaming'


export function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const settings = useSettingsStore((s) => s.settings)
  const { isStreaming, sendMessage, cancel } = useStreaming()

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || !activeConversationId || isStreaming) return

    setInput('')
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    await sendMessage(content)
  }, [input, activeConversationId, isStreaming, sendMessage])

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
    <div className="border-t border-weathered bg-paper-stack/30 p-3">
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
                : 'Type a message... (Enter to send, Shift+Enter for newline)'
          }
          disabled={isDisabled || isStreaming}
          rows={1}
          className="textarea textarea-bordered flex-1 bg-white resize-none text-sm min-h-[40px] max-h-[200px] leading-relaxed"
        />

        {isStreaming ? (
          /* Cancel button while streaming */
          <button
            onClick={cancel}
            className="btn btn-error btn-sm h-10 w-10 p-0"
            title="Cancel"
          >
            <Square size={14} />
          </button>
        ) : (
          /* Send button */
          <button
            onClick={handleSend}
            disabled={isDisabled || !input.trim()}
            className="btn btn-primary btn-sm h-10 w-10 p-0"
            title="Send"
          >
            <Send size={16} />
          </button>
        )}
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 mt-2 text-xs text-soft-charcoal/50">
          <span className="loading loading-dots loading-xs text-rca-red" />
          <span>Generating response...</span>
        </div>
      )}
    </div>
  )
}
