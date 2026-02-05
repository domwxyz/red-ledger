import { MessageSquare, FolderOpen, Settings } from 'lucide-react'
import { useUIStore } from '@/store'
import { ConversationList } from './ConversationList'
import { WorkspaceTree } from './WorkspaceTree'
import { SettingsPanel } from './SettingsPanel'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'conversations' as const, icon: MessageSquare, label: 'Chats' },
  { id: 'workspace' as const, icon: FolderOpen, label: 'Workspace' },
  { id: 'settings' as const, icon: Settings, label: 'Settings' }
]

export function Sidebar() {
  const sidebarTab = useUIStore((s) => s.sidebarTab)
  const setSidebarTab = useUIStore((s) => s.setSidebarTab)

  return (
    <div className="h-full flex flex-col bg-paper-stack">
      {/* Tab Bar */}
      <div className="flex border-b border-weathered">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setSidebarTab(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
              sidebarTab === id
                ? 'text-rca-red border-b-2 border-rca-red bg-paper'
                : 'text-soft-charcoal/60 hover:text-soft-charcoal hover:bg-paper/50'
            )}
            title={label}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {sidebarTab === 'conversations' && <ConversationList />}
        {sidebarTab === 'workspace' && <WorkspaceTree />}
        {sidebarTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
