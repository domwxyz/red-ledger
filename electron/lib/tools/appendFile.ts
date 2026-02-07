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
      name: 'append_file',
      description: 'Append content to the end of an existing file in the user\'s workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file within the workspace'
          },
          content: {
            type: 'string',
            description: 'Content to append to the file'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  execute: async (args, win) => {
    const path = args.path as string
    const content = args.content as string
    if (!path) throw new PathJailError('INVALID_INPUT', 'append_file requires a "path" argument')
    if (content === undefined || content === null) {
      throw new PathJailError('INVALID_INPUT', 'append_file requires a "content" argument')
    }
    const workspace = getWorkspaceService()
    await workspace.writeFile(dialogForWindow(win), path, content, true)
    return { success: true, path }
  }
})
