import { useEffect, useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useConversationStore, useUIStore } from '@/store'
import { cn, formatTimestamp, truncate } from '@/lib/utils'

interface ConversationListProps {
  compactNewChatButton?: boolean
}

export function ConversationList({ compactNewChatButton = false }: ConversationListProps) {
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const loadConversations = useConversationStore((s) => s.loadConversations)
  const createConversation = useConversationStore((s) => s.createConversation)
  const deleteConversation = useConversationStore((s) => s.deleteConversation)
  const renameConversation = useConversationStore((s) => s.renameConversation)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)
  const workspacePath = useUIStore((s) => s.workspacePath)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const handleCreate = async () => {
    await createConversation({ workspacePath })
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.redLedger) return
    const confirmed = await window.redLedger.showConfirmDialog({
      title: 'Delete Conversation',
      message: 'Delete this conversation?',
      detail: 'This action cannot be undone.'
    })
    if (confirmed) {
      await deleteConversation(id)
    }
  }

  const handleStartRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(id)
    setRenameValue(currentTitle)
  }

  const handleConfirmRename = async () => {
    if (renamingId && renameValue.trim()) {
      await renameConversation(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }

  const handleCancelRename = () => {
    setRenamingId(null)
  }

  return (
    <div className="h-full flex flex-col">
      {/* New Chat Button */}
      <div className="p-3 pb-2">
        <button
          onClick={handleCreate}
          className={cn(
            'btn btn-primary btn-sm w-full whitespace-nowrap',
            compactNewChatButton ? 'px-0' : 'gap-2'
          )}
          title="New Chat"
        >
          <Plus size={14} />
          {!compactNewChatButton && 'New Chat'}
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-soft-charcoal/40">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setActiveConversation(conv.id)}
              className={cn(
                'conversation-item group',
                activeConversationId === conv.id && 'active'
              )}
            >
              <div className="flex-1 min-w-0">
                {renamingId === conv.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirmRename()
                        if (e.key === 'Escape') handleCancelRename()
                      }}
                      className="input input-xs input-bordered flex-1 bg-base-100"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleConfirmRename() }} className="text-success p-0.5">
                      <Check size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleCancelRename() }} className="text-error p-0.5">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-medium truncate leading-snug">
                      {truncate(conv.title, 30)}
                    </div>
                    <div className="text-[11px] text-soft-charcoal/40 mt-0.5 leading-tight">
                      {formatTimestamp(conv.updatedAt)}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons (visible on hover) */}
              {renamingId !== conv.id && (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                    className="p-1 rounded hover:bg-base-300 text-soft-charcoal/40 hover:text-soft-charcoal transition-colors"
                    title="Rename"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(conv.id, e)}
                    className="p-1 rounded hover:bg-error/10 text-soft-charcoal/40 hover:text-error transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
