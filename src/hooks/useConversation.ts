import { useEffect } from 'react'
import { useConversationStore } from '@/store'

/**
 * Hook for conversation data loading.
 * Loads the conversation list on mount and provides
 * access to the active conversation and its messages.
 */
export function useConversation() {
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const messages = useConversationStore((s) => s.messages)
  const isLoadingMessages = useConversationStore((s) => s.isLoadingMessages)
  const loadConversations = useConversationStore((s) => s.loadConversations)
  const setActiveConversation = useConversationStore((s) => s.setActiveConversation)

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null

  return {
    conversations,
    activeConversation,
    activeConversationId,
    messages,
    isLoadingMessages,
    setActiveConversation
  }
}
