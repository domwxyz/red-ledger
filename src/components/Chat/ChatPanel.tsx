import { useConversationStore } from '@/store'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

export function ChatPanel() {
  const activeConversationId = useConversationStore((s) => s.activeConversationId)

  return (
    <div className="h-full flex flex-col bg-paper">
      {/* Header */}
      <div className="px-4 py-3 border-b border-weathered bg-paper-stack/50">
        <h2 className="text-sm font-semibold text-soft-charcoal">
          {activeConversationId ? 'Chat' : 'Red Ledger'}
        </h2>
      </div>

      {activeConversationId ? (
        <>
          {/* Message Feed */}
          <div className="flex-1 overflow-hidden">
            <MessageList />
          </div>

          {/* Input */}
          <ChatInput />
        </>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="text-5xl text-rca-red/20">&#9830;</div>
            <h3 className="text-lg font-semibold text-soft-charcoal">
              Red Ledger
            </h3>
            <p className="text-sm text-soft-charcoal/50 max-w-xs">
              Create a new conversation or select one from the sidebar to get started.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
