import { useState, useEffect, useCallback } from 'react'
import { Save, RotateCcw, FolderOpen } from 'lucide-react'
import { Editor } from '../Editor/Editor'
import { useUIStore } from '@/store'
import { cn } from '@/lib/utils'

interface ContextEditorProps {
  type: 'system' | 'user' | 'org'
  title: string
  description: string
}

export function ContextEditor({ type, title, description }: ContextEditorProps) {
  const [content, setContent] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')

  const isDirty = content !== savedSnapshot

  // Load content on mount
  useEffect(() => {
    if (!window.redLedger) return
    window.redLedger.loadContext(type).then((text) => {
      setContent(text)
      setSavedSnapshot(text)
    }).catch(() => {
      // Context unavailable — leave content empty
    })
  }, [type])

  // Save handler
  const handleSave = useCallback(async () => {
    if (!window.redLedger) return
    try {
      await window.redLedger.saveContext(type, content)
      setSavedSnapshot(content)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      useUIStore.getState().addToast({
        type: 'error',
        message: `Failed to save ${title}`
      })
    }
  }, [type, content, title])

  // Ctrl/Cmd+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        // Only save if this editor has focus (approximate check via dirty state)
        if (isDirty) {
          e.preventDefault()
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, isDirty])

  // Load from file handler
  const handleLoadFromFile = async () => {
    if (!window.redLedger) return
    try {
      const fileContent = await window.redLedger.openTextFile()
      if (fileContent !== null) {
        setContent(fileContent)
        // Do NOT update savedSnapshot — user must explicitly save
      }
    } catch {
      useUIStore.getState().addToast({
        type: 'error',
        message: `Failed to load file`
      })
    }
  }

  // Reset handler
  const handleReset = async () => {
    if (!window.redLedger) return
    const confirmed = await window.redLedger.showConfirmDialog({
      title: 'Reset Context',
      message: `Reset "${title}" to default?`,
      detail: 'This will load the default content. You must save manually to keep changes.'
    })
    if (!confirmed) return

    try {
      const defaultContent = await window.redLedger.loadDefaultContext(type)
      setContent(defaultContent)
      // Do NOT update savedSnapshot — user must explicitly save
    } catch {
      useUIStore.getState().addToast({
        type: 'error',
        message: `Failed to load default ${title}`
      })
    }
  }

  return (
    <div className="editor-container">
      {/* Header */}
      <div className="editor-header">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {isDirty && (
            <span className="text-xs text-warning">&#x2022; Unsaved</span>
          )}
          {saveStatus === 'saved' && !isDirty && (
            <span className="text-xs text-success">&#x2713; Saved</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleReset}
            className="btn btn-ghost btn-xs text-soft-charcoal/50 hover:text-soft-charcoal"
            title="Reset to default"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={handleLoadFromFile}
            className="btn btn-ghost btn-xs text-soft-charcoal/50 hover:text-soft-charcoal gap-1"
            title="Load from file"
          >
            <FolderOpen size={12} />
            Load
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className={cn(
              'btn btn-xs gap-1',
              isDirty ? 'btn-primary' : 'btn-ghost text-soft-charcoal/30'
            )}
            title="Save (Ctrl+S)"
          >
            <Save size={12} />
            Save
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="h-48">
        <Editor
          value={content}
          onChange={setContent}
          placeholder={description}
        />
      </div>
    </div>
  )
}
