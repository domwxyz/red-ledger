import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs'
import type { ContextType } from '../ipc/contract'

const CONTEXT_FILES: Record<ContextType, string> = {
  system: 'system.md',
  user: 'user.md',
  org: 'org.md'
}

/**
 * Domain service for context files (system/user/org prompts).
 * Manages the user's editable context directory and bundled defaults.
 * No Electron imports.
 */
export class ContextService {
  private contextDir: string
  private bundledDir: string

  constructor(contextDir: string, bundledDir: string) {
    this.contextDir = contextDir
    this.bundledDir = bundledDir
    this.ensureContextFiles()
  }

  load(type: ContextType): string {
    try {
      const filePath = join(this.contextDir, CONTEXT_FILES[type])
      if (!existsSync(filePath)) {
        return ''
      }
      return readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  }

  save(type: ContextType, content: string): void {
    const filePath = join(this.contextDir, CONTEXT_FILES[type])
    writeFileSync(filePath, content, 'utf-8')
  }

  loadDefault(type: ContextType): string {
    try {
      const bundledPath = join(this.bundledDir, CONTEXT_FILES[type])
      if (existsSync(bundledPath)) {
        return readFileSync(bundledPath, 'utf-8')
      }
      return ''
    } catch {
      return ''
    }
  }

  /**
   * Assemble the full system prompt from all context files.
   * Used by LlmService to build the conversation's system message.
   */
  assembleSystemPrompt(): string {
    const parts: string[] = []

    const systemContent = this.readContextTrimmed('system')
    if (systemContent) {
      parts.push(systemContent)
    }

    const userContent = this.readContextTrimmed('user')
    if (userContent && !isPlaceholderComment(userContent)) {
      parts.push(`\n## User Context\n${userContent}`)
    }

    const orgContent = this.readContextTrimmed('org')
    if (orgContent && !isPlaceholderComment(orgContent)) {
      parts.push(`\n## Organization Context\n${orgContent}`)
    }

    return parts.join('\n') || 'You are a helpful assistant.'
  }

  private readContextTrimmed(type: ContextType): string {
    try {
      const filePath = join(this.contextDir, CONTEXT_FILES[type])
      if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8').trim()
      }
    } catch {
      // ignore
    }
    return ''
  }

  private ensureContextFiles(): void {
    if (!existsSync(this.contextDir)) {
      mkdirSync(this.contextDir, { recursive: true })
    }

    for (const [, filename] of Object.entries(CONTEXT_FILES)) {
      const targetPath = join(this.contextDir, filename)
      if (!existsSync(targetPath)) {
        const bundledPath = join(this.bundledDir, filename)
        if (existsSync(bundledPath)) {
          copyFileSync(bundledPath, targetPath)
        } else {
          writeFileSync(targetPath, '', 'utf-8')
        }
      }
    }
  }
}

/**
 * Check if content is only HTML comments (the default placeholder).
 * We skip these to avoid injecting empty sections into the system prompt.
 */
function isPlaceholderComment(content: string): boolean {
  return content.replace(/<!--[\s\S]*?-->/g, '').trim().length === 0
}
