import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs'

type ContextType = 'system' | 'user' | 'org'

const CONTEXT_FILES: Record<ContextType, string> = {
  system: 'system.md',
  user: 'user.md',
  org: 'org.md'
}

function getContextDir(): string {
  return join(app.getPath('userData'), 'contexts')
}

function getBundledContextDir(): string {
  // In dev, contexts/ is at project root. In production, it's in resources/contexts/
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return join(app.getAppPath(), 'contexts')
  }
  return join(process.resourcesPath, 'contexts')
}

/**
 * Ensure context directory and files exist.
 * On first access, copy from bundled seed files if needed.
 */
function ensureContextFiles(): void {
  const contextDir = getContextDir()
  const bundledDir = getBundledContextDir()

  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true })
  }

  for (const [, filename] of Object.entries(CONTEXT_FILES)) {
    const targetPath = join(contextDir, filename)
    if (!existsSync(targetPath)) {
      const bundledPath = join(bundledDir, filename)
      if (existsSync(bundledPath)) {
        copyFileSync(bundledPath, targetPath)
      } else {
        // Create empty file if bundled seed is also missing
        writeFileSync(targetPath, '', 'utf-8')
      }
    }
  }
}

export function registerContextHandlers(): void {
  // Ensure context files exist on first registration
  ensureContextFiles()

  ipcMain.handle('context:load', (_event, type: ContextType) => {
    try {
      const filePath = join(getContextDir(), CONTEXT_FILES[type])
      if (!existsSync(filePath)) {
        return ''
      }
      return readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  })

  ipcMain.handle('context:save', (_event, type: ContextType, content: string) => {
    const filePath = join(getContextDir(), CONTEXT_FILES[type])
    writeFileSync(filePath, content, 'utf-8')
  })

  ipcMain.handle('context:loadDefault', (_event, type: ContextType) => {
    try {
      const bundledPath = join(getBundledContextDir(), CONTEXT_FILES[type])
      if (existsSync(bundledPath)) {
        return readFileSync(bundledPath, 'utf-8')
      }
      return ''
    } catch {
      return ''
    }
  })
}
