import { useState, useEffect, useCallback } from 'react'
import { FolderOpen } from 'lucide-react'
import { useUIStore, useSettingsStore } from '@/store'
import { FileTree } from '../FileTree/FileTree'
import { FileViewer } from './FileViewer'
import type { FileNode } from '@/types'

export function WorkspaceTree() {
  const workspacePath = useUIStore((s) => s.workspacePath)
  const setWorkspacePath = useUIStore((s) => s.setWorkspacePath)
  const selectedFilePath = useUIStore((s) => s.selectedFilePath)
  const settings = useSettingsStore((s) => s.settings)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  const [files, setFiles] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleOpenFolder = useCallback(async () => {
    if (!window.redLedger) return
    const path = await window.redLedger.selectWorkspace()
    if (path) {
      setWorkspacePath(path)
      if (settings && settings.lastWorkspacePath !== path) {
        saveSettings({ ...settings, lastWorkspacePath: path })
      }
    }
  }, [setWorkspacePath, settings, saveSettings])

  useEffect(() => {
    if (!workspacePath) {
      setFiles([])
      return
    }

    if (!window.redLedger) return
    setIsLoading(true)
    window.redLedger
      .listFiles()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setIsLoading(false))
  }, [workspacePath])

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 pb-2 space-y-1.5">
        <button
          onClick={handleOpenFolder}
          className="btn btn-sm btn-outline w-full gap-2"
        >
          <FolderOpen size={14} />
          Open Folder
        </button>

        {workspacePath && (
          <div className="text-[11px] text-soft-charcoal/40 truncate px-0.5" title={workspacePath}>
            {workspacePath}
          </div>
        )}
      </div>

      <div
        className={selectedFilePath ? 'overflow-y-auto px-1' : 'flex-1 overflow-y-auto px-1'}
        style={selectedFilePath ? { height: '50%' } : undefined}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="loading loading-spinner loading-sm text-rca-red" />
          </div>
        ) : files.length > 0 ? (
          <FileTree nodes={files} />
        ) : workspacePath ? (
          <div className="px-4 py-8 text-center text-xs text-soft-charcoal/40">
            Empty workspace
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-soft-charcoal/40 leading-relaxed">
            Select a workspace folder to browse files
          </div>
        )}
      </div>

      <FileViewer />
    </div>
  )
}
