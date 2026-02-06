import { ContextEditor } from './ContextEditor'

const CONTEXT_TYPES = [
  { type: 'system' as const, title: 'System Prompt', description: 'Core behavioral instructions' },
  { type: 'user' as const, title: 'User Context', description: 'Personal info, preferences' },
  { type: 'org' as const, title: 'Org Context', description: 'Organization mission, terms, style' }
]

export function ContextPanel() {
  return (
    <div className="h-full flex flex-col bg-paper">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-weathered bg-paper-stack/50 flex items-center min-h-[42px]">
        <h2 className="text-xs font-semibold text-soft-charcoal/70 uppercase tracking-wider">Context</h2>
      </div>

      {/* Three stacked editors — each fills 1/3 of available space */}
      <div className="flex-1 flex flex-col p-3 gap-3 min-h-0">
        {CONTEXT_TYPES.map(({ type, title, description }) => (
          <ContextEditor
            key={type}
            type={type}
            title={title}
            description={description}
          />
        ))}
      </div>
    </div>
  )
}
