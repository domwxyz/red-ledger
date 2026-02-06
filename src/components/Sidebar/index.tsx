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
      <div className="flex items-stretch bg-paper-stack px-2 pt-2 gap-1">
        {TABS.map(({ id, icon: Icon, label }) => {
          const isActive = sidebarTab === id
          return (
            <button
              key={id}
              onClick={() => setSidebarTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-t-lg transition-all border border-b-0',
                isActive
                  ? 'bg-paper text-soft-charcoal border-weathered relative z-10 shadow-sm'
                  : 'bg-transparent text-soft-charcoal/50 border-transparent hover:text-soft-charcoal/80 hover:bg-paper/40'
              )}
              title={label}
            >
              <Icon size={14} strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          )
        })}
      </div>
      {/* Tab edge — visually connects active tab to content */}
      <div className="h-px bg-weathered mx-2" />

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden bg-paper mx-2 mb-2 border-x border-b border-weathered rounded-b-lg">
        {sidebarTab === 'conversations' && <ConversationList />}
        {sidebarTab === 'workspace' && <WorkspaceTree />}
        {sidebarTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
