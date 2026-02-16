import { useCallback, useRef, useState } from 'react'
import { formatError } from '@/lib/errors'
import { useConversationStore, useUIStore } from '@/store'
import { useStreaming } from '@/hooks/useStreaming'
import type { Attachment } from '@/types'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif'
])

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return fileName.slice(dotIndex).toLowerCase()
}

function hasFileDragPayload(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function resolveDroppedFilePath(file: File): string {
  const directPath = typeof file.path === 'string' ? file.path : ''
  if (directPath.length > 0) return directPath
  return window.redLedger.getPathForFile(file)
}

export function ChatPanel() {
  const activeConversationId = useConversationStore((s) => s.activeConversationId)
  const streaming = useStreaming()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDropTargetActive, setIsDropTargetActive] = useState(false)
  const [isParsingDrop, setIsParsingDrop] = useState(false)
  const dropDepthRef = useRef(0)

  const addAttachments = useCallback((nextAttachments: Attachment[]) => {
    if (nextAttachments.length === 0) return
    setAttachments((prev) => [...prev, ...nextAttachments])
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearAttachments = useCallback(() => {
    setAttachments([])
  }, [])

  const onDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragPayload(event)) return
    event.preventDefault()
    dropDepthRef.current += 1
    setIsDropTargetActive(true)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragPayload(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDropTargetActive(true)
  }, [])

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragPayload(event)) return
    event.preventDefault()
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1)
    if (dropDepthRef.current === 0) {
      setIsDropTargetActive(false)
    }
  }, [])

  const onDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragPayload(event)) return
    event.preventDefault()

    dropDepthRef.current = 0
    setIsDropTargetActive(false)

    const droppedFiles = Array.from(event.dataTransfer.files)
    if (droppedFiles.length === 0) return

    const supportedPaths: string[] = []
    const unsupportedNames: string[] = []
    const seenPaths = new Set<string>()

    for (const file of droppedFiles) {
      const extension = getFileExtension(file.name)
      const filePath = resolveDroppedFilePath(file)
      if (!SUPPORTED_ATTACHMENT_EXTENSIONS.has(extension) || filePath.length === 0) {
        unsupportedNames.push(file.name)
        continue
      }
      if (seenPaths.has(filePath)) continue
      seenPaths.add(filePath)
      supportedPaths.push(filePath)
    }

    if (supportedPaths.length === 0) {
      useUIStore.getState().addToast({
        type: 'warning',
        message: 'No supported files found. Use .txt, .md, .pdf, .png, .jpg/.jpeg, .webp, or .gif.'
      })
      return
    }

    setIsParsingDrop(true)
    try {
      const result = await window.redLedger.parseAttachmentFiles(supportedPaths)
      if (result.attachments.length > 0) {
        addAttachments(result.attachments)
      }

      const failedCount = unsupportedNames.length + result.failed.length
      if (failedCount > 0) {
        useUIStore.getState().addToast({
          type: 'warning',
          message: `${failedCount} file${failedCount === 1 ? '' : 's'} could not be attached.`
        })
      }
    } catch (err) {
      useUIStore.getState().addToast({
        type: 'error',
        message: formatError(err)
      })
    } finally {
      setIsParsingDrop(false)
    }
  }, [addAttachments])

  const showDropOverlay = isDropTargetActive || isParsingDrop

  return (
    <div
      className="h-full flex flex-col bg-paper relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {showDropOverlay && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-paper/75">
          <div className="rounded-lg border-2 border-dashed border-rca-red/45 bg-paper-stack/95 px-6 py-5 text-center shadow-sm">
            <p className="text-sm font-medium text-soft-charcoal">
              {isParsingDrop ? 'Attaching files...' : 'Drop files to attach to your next message'}
            </p>
            <p className="mt-1 text-xs text-soft-charcoal/55">
              Supports .txt, .md, .pdf, .png, .jpg/.jpeg, .webp, and .gif
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-2.5 border-b border-weathered bg-paper-stack/50 flex items-center min-h-[42px]">
        <h2 className="text-xs font-semibold text-soft-charcoal/70 uppercase tracking-wider">
          {activeConversationId ? 'Chat' : 'Red Ledger'}
        </h2>
      </div>

      {activeConversationId ? (
        <>
          {/* Message Feed */}
          <div className="flex-1 overflow-hidden">
            <MessageList
              isStreaming={streaming.isStreaming}
              isReceivingThinking={streaming.isReceivingThinking}
              onRetry={streaming.retry}
              onEdit={streaming.editLastUserMessage}
            />
          </div>

          {/* Input */}
          <ChatInput
            streaming={streaming}
            attachments={attachments}
            onAddAttachments={addAttachments}
            onRemoveAttachment={removeAttachment}
            onClearAttachments={clearAttachments}
          />
        </>
      ) : (
        <>
          {/* Empty State */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-6xl text-rca-red/15 leading-none">&#128213;</div>
              <div>
                <h3 className="text-base font-semibold text-soft-charcoal">
                  Red Ledger
                </h3>
                <p className="text-xs text-soft-charcoal/40 max-w-[240px] mt-1.5 leading-relaxed">
                  Create a new conversation or select one from the sidebar to get started.
                </p>
              </div>
            </div>
          </div>
          <ChatInput
            streaming={streaming}
            attachments={attachments}
            onAddAttachments={addAttachments}
            onRemoveAttachment={removeAttachment}
            onClearAttachments={clearAttachments}
          />
        </>
      )}
    </div>
  )
}
