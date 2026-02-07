import { registerTool } from './registry'
import { getWorkspaceService } from '../../ipc/fs'

registerTool({
  definition: {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all files and directories in the user\'s workspace (or a subdirectory within it). Returns a tree structure. Skips node_modules, .git, and dotfiles.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional relative subdirectory path. Omit to list the entire workspace root.'
          }
        },
        required: []
      }
    }
  },
  execute: async (args) => {
    const path = args.path as string | undefined
    const workspace = getWorkspaceService()
    return workspace.listFiles(path || undefined)
  }
})
