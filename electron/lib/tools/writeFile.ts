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
      name: 'write_file',
      description: 'Write content to a file in the user\'s workspace directory. Creates the file if it doesn\'t exist, or overwrites it if it does (with user confirmation).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file within the workspace'
          },
          content: {
            type: 'string',
            description: 'The full content to write to the file'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  execute: async (args, win) => {
    const input = requireObjectArgs(args, 'write_file')
    const path = requireStringArg(input, 'path', 'write_file')
    const content = requireStringArg(input, 'content', 'write_file', {
      trim: false,
      allowEmpty: true
    })
    const workspace = getWorkspaceService()
    await workspace.writeFile(dialogForWindow(win), path, content, false)
    return { success: true, path }
  }
})
