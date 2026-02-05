import { useState, useEffect } from 'react'
import { FolderOpen } from 'lucide-react'
import { useUIStore } from '@/store'
import { FileTree } from '../FileTree/FileTree'
import { FileViewer } from './FileViewer'
import type { FileNode } from '@/types'

export function WorkspaceTree() {
  const workspacePath = useUIStore((s) => s.workspacePath)
  const setWorkspacePath = useUIStore((s) => s.setWorkspacePath)
  const selectedFilePath = useUIStore((s) => s.selectedFilePath)
  const [files, setFiles] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleOpenFolder = async () => {
    if (!window.redLedger) return
    const path = await window.redLedger.selectWorkspace()
    if (path) {
      setWorkspacePath(path)
    }
  }

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
      <div className="p-2 space-y-2">
        <button
          onClick={handleOpenFolder}
          className="btn btn-sm btn-outline w-full gap-2"
        >
          <FolderOpen size={14} />
          Open Folder
        </button>

        {workspacePath && (
          <div className="text-xs text-soft-charcoal/50 truncate px-1" title={workspacePath}>
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
          <div className="p-3 text-center text-sm text-soft-charcoal/50">
            Empty workspace
          </div>
        ) : (
          <div className="p-3 text-center text-sm text-soft-charcoal/50">
            Select a workspace folder to browse files
          </div>
        )}
      </div>

      <FileViewer />
    </div>
  )
}
