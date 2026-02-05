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
      <div className="px-4 py-3 border-b border-weathered bg-paper-stack/50">
        <h2 className="text-sm font-semibold text-soft-charcoal">Context</h2>
      </div>

      {/* Three stacked editors */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
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
