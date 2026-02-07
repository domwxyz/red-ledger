import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

/**
 * Gitignore parsing — pure utility.
 * No Electron imports. Directly testable.
 */

export interface GitignoreRule {
  regex: RegExp
  negation: boolean
  directoryOnly: boolean
}

/**
 * Convert a single .gitignore glob pattern to a RegExp.
 */
export function gitignoreGlobToRegex(pattern: string): RegExp {
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
export function parseGitignore(content: string): GitignoreRule[] {
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
export function loadGitignoreRules(workspaceRoot: string): GitignoreRule[] {
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
export function isIgnoredByGitignore(
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
