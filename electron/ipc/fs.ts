import { ipcMain, dialog, BrowserWindow } from 'electron'
import { resolve, normalize, sep, relative } from 'path'
import { existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, lstatSync } from 'fs'
import { getCurrentSettings } from './settings'
import type { FileNode } from '../../src/types'

// ─── RedLedgerError ──────────────────────────────────────────────────────────

export class RedLedgerError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'RedLedgerError'
    this.code = code
    this.details = details
  }
}

// ─── Path Resolution & Jail Logic ────────────────────────────────────────────

// Patterns that indicate path traversal or escape attempts
const TRAVERSAL_PATTERNS = [
  /\.\.\//,        // ../
  /\.\.\\/,        // ..\
  /^~\//,          // ~/
  /^~\\/,          // ~\
  /^\//,           // Absolute Unix
  /^[A-Za-z]:[/\\]/, // Absolute Windows (C:\ or C:/)
  /^\\\\/,         // UNC paths (\\server\share)
  /^\/\/\*\//      // Alternative UNC
]

const CONTROL_CHARS = /[\x00-\x1F\x80-\x9F]/
const WINDOWS_INVALID = /[<>:"|?*]/

export function resolveWorkspacePath(workspaceRoot: string, relativePath: string): string {
  // Reject empty/null paths
  if (!relativePath || !workspaceRoot) {
    throw new RedLedgerError('INVALID_INPUT', 'Path cannot be empty')
  }

  // Reject null bytes
  if (relativePath.includes('\0') || workspaceRoot.includes('\0')) {
    throw new RedLedgerError('PATH_TRAVERSAL', 'Path contains null bytes')
  }

  // Reject control characters
  if (CONTROL_CHARS.test(relativePath)) {
    throw new RedLedgerError('PATH_TRAVERSAL', 'Path contains control characters')
  }

  // Reject Windows-invalid characters (on Windows)
  if (process.platform === 'win32' && WINDOWS_INVALID.test(relativePath)) {
    throw new RedLedgerError('PATH_TRAVERSAL', 'Path contains invalid characters')
  }

  // Reject traversal patterns
  for (const pattern of TRAVERSAL_PATTERNS) {
    if (pattern.test(relativePath)) {
      throw new RedLedgerError('PATH_TRAVERSAL', `Path contains disallowed pattern: ${relativePath}`)
    }
  }

  // Resolve the full path
  const resolved = resolve(workspaceRoot, relativePath)
  const normalizedResolved = normalize(resolved)
  const normalizedRoot = normalize(workspaceRoot)

  // Containment check (case-insensitive on Windows)
  const compareFn = process.platform === 'win32'
    ? (a: string, b: string) => a.toLowerCase().startsWith(b.toLowerCase())
    : (a: string, b: string) => a.startsWith(b)

  if (!compareFn(normalizedResolved, normalizedRoot + sep) && normalizedResolved !== normalizedRoot) {
    throw new RedLedgerError('PATH_TRAVERSAL', 'Path escapes workspace directory')
  }

  // Symlink rejection: check each component
  try {
    const stat = lstatSync(normalizedResolved)
    if (stat.isSymbolicLink()) {
      throw new RedLedgerError('PATH_TRAVERSAL', 'Symbolic links are not allowed')
    }
  } catch (err) {
    // File may not exist yet (for writes) — that's OK
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (err instanceof RedLedgerError) throw err
    }
  }

  return normalizedResolved
}

// ─── File Listing ────────────────────────────────────────────────────────────

const SKIP_PATTERNS = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db'
])

// ─── .gitignore Parsing ──────────────────────────────────────────────────────

interface GitignoreRule {
  regex: RegExp
  negation: boolean
  directoryOnly: boolean
}

/**
 * Convert a single .gitignore glob pattern to a RegExp.
 */
function gitignoreGlobToRegex(pattern: string): RegExp {
  // Escape regex special characters except * and ?
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]
    if (ch === '*' && pattern[i + 1] === '*') {
      // ** — match any path segment(s)
      if (pattern[i + 2] === '/') {
        re += '(?:.+/)?'
        i += 3
      } else {
        re += '.*'
        i += 2
      }
    } else if (ch === '*') {
      // * — match anything except /
      re += '[^/]*'
      i++
    } else if (ch === '?') {
      re += '[^/]'
      i++
    } else if (ch === '[') {
      // Character class — pass through until ]
      const closeIdx = pattern.indexOf(']', i + 1)
      if (closeIdx === -1) {
        re += '\\['
        i++
      } else {
        re += pattern.slice(i, closeIdx + 1)
        i = closeIdx + 1
      }
    } else if ('.+^${}()|\\'.includes(ch)) {
      re += '\\' + ch
      i++
    } else {
      re += ch
      i++
    }
  }
  return new RegExp('^' + re + '$')
}

/**
 * Parse a .gitignore file and return an array of rules.
 */
function parseGitignore(content: string): GitignoreRule[] {
  const rules: GitignoreRule[] = []

  for (let line of content.split('\n')) {
    line = line.trimEnd()

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue

    let negation = false
    let directoryOnly = false

    // Handle negation
    if (line.startsWith('!')) {
      negation = true
      line = line.slice(1)
    }

    // Handle directory-only suffix
    if (line.endsWith('/')) {
      directoryOnly = true
      line = line.slice(0, -1)
    }

    if (!line) continue

    // If the pattern contains a slash (not trailing), it's relative to root
    // Otherwise it matches anywhere in the tree
    const hasSlash = line.includes('/')
    let glob = line

    if (!hasSlash) {
      // Match this name in any directory
      glob = '**/' + glob
    } else if (line.startsWith('/')) {
      // Anchored to root — strip leading /
      glob = glob.slice(1)
    }

    rules.push({
      regex: gitignoreGlobToRegex(glob),
      negation,
      directoryOnly
    })
  }

  return rules
}

/**
 * Load and parse the workspace .gitignore, returning parsed rules.
 * Returns an empty array if no .gitignore is found.
 */
function loadGitignoreRules(workspaceRoot: string): GitignoreRule[] {
  const gitignorePath = resolve(workspaceRoot, '.gitignore')
  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8')
      return parseGitignore(content)
    }
  } catch {
    // Ignore read errors
  }
  return []
}

/**
 * Check if a relative path should be ignored according to gitignore rules.
 */
function isIgnoredByGitignore(
  relativePath: string,
  isDirectory: boolean,
  rules: GitignoreRule[]
): boolean {
  let ignored = false

  for (const rule of rules) {
    // Directory-only rules only apply to directories
    if (rule.directoryOnly && !isDirectory) continue

    if (rule.regex.test(relativePath)) {
      ignored = !rule.negation
    }
  }

  return ignored
}

function listDirectory(dirPath: string, rootPath: string, gitignoreRules?: GitignoreRule[]): FileNode[] {
  const entries = readdirSync(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  // Load gitignore rules at the top-level call
  if (gitignoreRules === undefined) {
    gitignoreRules = loadGitignoreRules(rootPath)
  }

  for (const entry of entries) {
    // Skip dotfiles and common ignore patterns
    if (entry.name.startsWith('.') || SKIP_PATTERNS.has(entry.name)) {
      continue
    }

    const fullPath = resolve(dirPath, entry.name)

    // Skip symlinks
    try {
      const stat = lstatSync(fullPath)
      if (stat.isSymbolicLink()) continue
    } catch {
      continue
    }

    const relativePath = fullPath
      .slice(rootPath.length + 1)
      .replace(/\\/g, '/')

    const isDir = entry.isDirectory()

    // Check gitignore rules
    if (isIgnoredByGitignore(relativePath, isDir, gitignoreRules)) {
      continue
    }

    if (isDir) {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children: listDirectory(fullPath, rootPath, gitignoreRules)
      })
    } else {
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file'
      })
    }
  }

  // Sort: directories first, then alphabetical
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ─── Workspace Path State ────────────────────────────────────────────────────

let workspacePath: string | null = null

export function setWorkspacePath(path: string | null): void {
  workspacePath = path
}

export function getWorkspacePath(): string | null {
  return workspacePath
}

// ─── Core File Operations (callable by tool executor) ────────────────────────

/**
 * Read a file from the workspace. Applies path jail and strict mode dialogs.
 * @param win BrowserWindow for native dialogs (strict mode). Pass null to skip dialogs.
 * @param relativePath Path relative to workspace root
 */
export async function readWorkspaceFile(
  win: BrowserWindow | null,
  relativePath: string
): Promise<string> {
  if (!workspacePath) {
    throw new RedLedgerError('WORKSPACE_NOT_SET', 'No workspace directory selected')
  }

  const fullPath = resolveWorkspacePath(workspacePath, relativePath)

  // Strict mode check
  if (win) {
    const settings = getCurrentSettings()
    if (settings.strictMode) {
      const confirmed = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Deny', 'Allow'],
        defaultId: 0,
        title: 'File Read Request',
        message: `The assistant wants to read: ${relativePath}`,
        detail: 'Do you want to allow this file read?'
      })
      if (confirmed.response === 0) {
        throw new RedLedgerError('USER_DENIED', 'User denied file read')
      }
    }
  }

  if (!existsSync(fullPath)) {
    throw new RedLedgerError('FILE_NOT_FOUND', `File not found: ${relativePath}`)
  }

  return readFileSync(fullPath, 'utf-8')
}

/**
 * Write or append to a file in the workspace. Applies path jail, overwrite
 * confirmation (always), and strict mode dialog for new files.
 */
export async function writeWorkspaceFile(
  win: BrowserWindow | null,
  relativePath: string,
  content: string,
  append: boolean = false
): Promise<void> {
  if (!workspacePath) {
    throw new RedLedgerError('WORKSPACE_NOT_SET', 'No workspace directory selected')
  }

  const fullPath = resolveWorkspacePath(workspacePath, relativePath)
  const fileExists = existsSync(fullPath)

  if (win) {
    const settings = getCurrentSettings()

    // Overwrite confirmation (always, regardless of strict mode)
    if (fileExists && !append) {
      const confirmed = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Cancel', 'Overwrite'],
        defaultId: 0,
        title: 'Overwrite File',
        message: `Overwrite existing file? This cannot be undone.`,
        detail: fullPath
      })
      if (confirmed.response === 0) {
        throw new RedLedgerError('USER_DENIED', 'User cancelled file overwrite')
      }
    }

    // Strict mode check for new file creation
    if (!fileExists && settings.strictMode) {
      const confirmed = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Deny', 'Allow'],
        defaultId: 0,
        title: 'File Write Request',
        message: `The assistant wants to create: ${relativePath}`,
        detail: 'Do you want to allow this file creation?'
      })
      if (confirmed.response === 0) {
        throw new RedLedgerError('USER_DENIED', 'User denied file creation')
      }
    }
  }

  if (append) {
    appendFileSync(fullPath, content, 'utf-8')
  } else {
    writeFileSync(fullPath, content, 'utf-8')
  }
}

/**
 * List files in the workspace directory tree.
 */
export function listWorkspaceFiles(relativePath?: string): FileNode[] {
  if (!workspacePath) {
    throw new RedLedgerError('WORKSPACE_NOT_SET', 'No workspace directory selected')
  }

  const targetDir = relativePath
    ? resolveWorkspacePath(workspacePath, relativePath)
    : workspacePath

  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new RedLedgerError('FILE_NOT_FOUND', 'Directory not found')
  }

  return listDirectory(targetDir, workspacePath)
}

// ─── IPC Registration ────────────────────────────────────────────────────────

export function registerFsHandlers(win: BrowserWindow): void {
  ipcMain.handle('fs:selectWorkspace', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Workspace Directory'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    workspacePath = result.filePaths[0]
    return workspacePath
  })

  // IPC handlers delegate to the exported core functions
  ipcMain.handle('fs:readFile', async (_event, relativePath: string) => {
    return readWorkspaceFile(win, relativePath)
  })

  ipcMain.handle('fs:writeFile', async (_event, relativePath: string, content: string, append?: boolean) => {
    return writeWorkspaceFile(win, relativePath, content, append ?? false)
  })

  ipcMain.handle('fs:listFiles', (_event, relativePath?: string) => {
    return listWorkspaceFiles(relativePath)
  })
}
