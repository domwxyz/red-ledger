import { dialog, BrowserWindow } from 'electron'
import { registerTool } from './registry'
import { getWorkspaceService } from '../../ipc/fs'
import { PathJailError } from '../../services/pathJail'
import type { DialogAdapter } from '../../services/WorkspaceService'

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
    const path = args.path as string
    const content = args.content as string
    if (!path) throw new PathJailError('INVALID_INPUT', 'write_file requires a "path" argument')
    if (content === undefined || content === null) {
      throw new PathJailError('INVALID_INPUT', 'write_file requires a "content" argument')
    }
    const workspace = getWorkspaceService()
    await workspace.writeFile(dialogForWindow(win), path, content, false)
    return { success: true, path }
  }
})
