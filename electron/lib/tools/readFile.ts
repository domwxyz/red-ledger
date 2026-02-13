import { dialog, BrowserWindow } from 'electron'
import { registerTool } from './registry'
import { getWorkspaceService } from '../../ipc/fs'
import type { DialogAdapter } from '../../services/WorkspaceService'
import { requireObjectArgs, requireStringArg } from './args'

function dialogForWindow(win: BrowserWindow | null): DialogAdapter | null {
  if (!win) return null
  return { showMessageBox: (options) => dialog.showMessageBox(win, options) }
}

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the user\'s workspace directory. For PDF files, returns extracted text content.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file within the workspace (e.g. "src/index.ts")'
          }
        },
        required: ['path']
      }
    }
  },
  execute: async (args, win) => {
    const input = requireObjectArgs(args, 'read_file')
    const path = requireStringArg(input, 'path', 'read_file')
    const workspace = getWorkspaceService()
    const content = await workspace.readFile(dialogForWindow(win), path)
    return { content, path }
  }
})
