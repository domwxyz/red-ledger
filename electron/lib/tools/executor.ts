import { BrowserWindow } from 'electron'
import type { ToolCall } from '../../../src/types'
import { readWorkspaceFile, writeWorkspaceFile, listWorkspaceFiles, RedLedgerError } from '../../ipc/fs'
import { executeWebSearch } from '../../ipc/search'

/**
 * Execute a tool call from the LLM and return the same ToolCall with
 * a `result` field populated.
 *
 * **Critical**: File tools route through the strict-mode-aware handlers
 * in ipc/fs.ts. This means:
 * - All path validation and jail checks apply
 * - Strict mode dialogs fire for LLM-initiated file access
 * - Overwrite confirmations fire for existing files
 *
 * If a tool throws, the error is caught and returned as
 * { error, code } in the result — it does NOT crash the stream.
 * This lets the LLM see what went wrong and potentially self-correct.
 */
export async function executeTool(
  toolCall: ToolCall,
  win: BrowserWindow | null
): Promise<ToolCall> {
  try {
    const result = await dispatchTool(toolCall, win)
    return { ...toolCall, result }
  } catch (err) {
    const isRLError = err instanceof RedLedgerError ||
      (err instanceof Error && 'code' in err)

    const errorResult = {
      error: err instanceof Error ? err.message : String(err),
      code: isRLError ? (err as RedLedgerError).code : 'UNKNOWN'
    }

    return { ...toolCall, result: errorResult }
  }
}

async function dispatchTool(
  toolCall: ToolCall,
  win: BrowserWindow | null
): Promise<unknown> {
  const args = toolCall.arguments

  switch (toolCall.name) {
    case 'read_file': {
      const path = args.path as string
      if (!path) throw new RedLedgerError('INVALID_INPUT', 'read_file requires a "path" argument')
      const content = await readWorkspaceFile(win, path)
      return { content, path }
    }

    case 'write_file': {
      const path = args.path as string
      const content = args.content as string
      if (!path) throw new RedLedgerError('INVALID_INPUT', 'write_file requires a "path" argument')
      if (content === undefined || content === null) {
        throw new RedLedgerError('INVALID_INPUT', 'write_file requires a "content" argument')
      }
      await writeWorkspaceFile(win, path, content, false)
      return { success: true, path }
    }

    case 'append_file': {
      const path = args.path as string
      const content = args.content as string
      if (!path) throw new RedLedgerError('INVALID_INPUT', 'append_file requires a "path" argument')
      if (content === undefined || content === null) {
        throw new RedLedgerError('INVALID_INPUT', 'append_file requires a "content" argument')
      }
      await writeWorkspaceFile(win, path, content, true)
      return { success: true, path }
    }

    case 'list_files': {
      const path = args.path as string | undefined
      const tree = listWorkspaceFiles(path || undefined)
      return tree
    }

    case 'web_search': {
      const query = args.query as string
      if (!query) throw new RedLedgerError('INVALID_INPUT', 'web_search requires a "query" argument')
      const numResults = parseInt(String(args.num_results || '5'), 10) || 5
      const results = await executeWebSearch(query, numResults)
      return results
    }

    default:
      throw new RedLedgerError('INVALID_INPUT', `Unknown tool: ${toolCall.name}`)
  }
}
