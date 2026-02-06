import { useConversationStore } from '@/store'
import { useStreaming } from '@/hooks/useStreaming'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

export function ChatPanel() {
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const streaming = useStreaming()

  return (
    <div className="h-full flex flex-col bg-paper">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-weathered bg-paper-stack/50 flex items-center min-h-[42px]">
        <h2 className="text-xs font-semibold text-soft-charcoal/70 uppercase tracking-wider">
          {activeConversationId ? 'Chat' : 'Red Ledger'}
        </h2>
      </div>

      {activeConversationId ? (
        <>
          {/* Message Feed */}
          <div className="flex-1 overflow-hidden">
            <MessageList isStreaming={streaming.isStreaming} onRetry={streaming.retry} />
          </div>

          {/* Input */}
          <ChatInput streaming={streaming} />
        </>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-6xl text-rca-red/15 leading-none">&#9830;</div>
            <div>
              <h3 className="text-base font-semibold text-soft-charcoal">
                Red Ledger
              </h3>
              <p className="text-xs text-soft-charcoal/40 max-w-[240px] mt-1.5 leading-relaxed">
                Create a new conversation or select one from the sidebar to get started.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
