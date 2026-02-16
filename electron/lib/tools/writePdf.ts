import { dialog, BrowserWindow } from 'electron'
import { registerTool } from './registry'
import { getWorkspaceService } from '../../ipc/fs'
import type { DialogAdapter } from '../../services/WorkspaceService'
import { PathJailError } from '../../services/pathJail'
import { renderMarkdownToPdf } from '../../services/PdfRenderService'
import { optionalStringArg, requireObjectArgs, requireStringArg } from './args'

function dialogForWindow(win: BrowserWindow | null): DialogAdapter | null {
  if (!win) return null
  return { showMessageBox: (options) => dialog.showMessageBox(win, options) }
}

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'write_pdf',
      description: 'Render markdown content into a PDF file in the user workspace. Creates the file if it does not exist, or overwrites it if it does (with user confirmation).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative .pdf path within the workspace (e.g. "docs/report.pdf")'
          },
          markdown: {
            type: 'string',
            description: 'Markdown content to render into the PDF'
          },
          title: {
            type: 'string',
            description: 'Optional document title for the rendered PDF'
          }
        },
        required: ['path', 'markdown']
      }
    }
  },
  execute: async (args, win) => {
    const input = requireObjectArgs(args, 'write_pdf')
    const path = requireStringArg(input, 'path', 'write_pdf')
    const markdown = requireStringArg(input, 'markdown', 'write_pdf', {
      trim: false,
      allowEmpty: true
    })
    const title = optionalStringArg(input, 'title', 'write_pdf')

    if (!path.toLowerCase().endsWith('.pdf')) {
      throw new PathJailError('INVALID_INPUT', 'write_pdf requires a ".pdf" file path')
    }

    const pdfBuffer = await renderMarkdownToPdf(markdown, { title })
    const workspace = getWorkspaceService()
    await workspace.writeBinaryFile(dialogForWindow(win), path, pdfBuffer)

    return { success: true, path, bytes: pdfBuffer.byteLength }
  }
})
