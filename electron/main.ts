import { app, BrowserWindow, dialog, Menu } from 'electron'
import { join, basename } from 'path'
import { readFileSync } from 'fs'
import { resolveSettingsPath, resolveDbPath } from './services/SettingsService'
import { registerDbHandlers, getConversationService } from './ipc/db'
import { registerContextHandlers, getContextService } from './ipc/context'
import { registerSettingsHandlers, getCurrentSettings } from './ipc/settings'
import { registerFsHandlers, getWorkspaceService } from './ipc/fs'
import { registerLlmHandlers } from './ipc/llm'
import { registerSearchHandlers } from './ipc/search'
import { handleIpc } from './ipc/typedIpc'
import { assertObject } from './ipc/validate'

let mainWindow: BrowserWindow | null = null
let ipcHandlersRegistered = false

// ─── Single Instance Lock ────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// ─── Window Creation ─────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Red Ledger',
    backgroundColor: '#FDFCF8',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  // Load the app
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    mainWindow.loadURL(url)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // ─── Right-click context menu (Copy / Cut / Paste / Select All) ──────────
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText } = params
    const hasSelection = selectionText.trim().length > 0

    const menu = Menu.buildFromTemplate([
      {
        label: 'Cut',
        role: 'cut',
        enabled: isEditable && hasSelection && editFlags.canCut,
        visible: isEditable
      },
      {
        label: 'Copy',
        role: 'copy',
        enabled: hasSelection && editFlags.canCopy,
        visible: hasSelection || isEditable
      },
      {
        label: 'Paste',
        role: 'paste',
        enabled: isEditable && editFlags.canPaste,
        visible: isEditable
      },
      { type: 'separator', visible: isEditable },
      {
        label: 'Select All',
        role: 'selectAll',
        enabled: editFlags.canSelectAll,
        visible: isEditable
      }
    ])

    // Only show the menu if there's something useful to show
    if (hasSelection || isEditable) {
      menu.popup()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Path Resolution ────────────────────────────────────────────────────────

function getContextDir(): string {
  return join(app.getPath('userData'), 'contexts')
}

function getBundledContextDir(): string {
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    return join(app.getAppPath(), 'contexts')
  }
  return join(process.resourcesPath, 'contexts')
}

// ─── IPC Handler Registration ────────────────────────────────────────────────

function registerIpcHandlers(): void {
  if (ipcHandlersRegistered) return
  ipcHandlersRegistered = true

  // Resolve paths
  const settingsPath = resolveSettingsPath(process.resourcesPath, app.getPath('userData'))
  const dbPath = resolveDbPath(process.resourcesPath, app.getPath('userData'))

  // 1. Database (no dependencies)
  registerDbHandlers(dbPath)

  // 2. Settings (wires workspace path side effect)
  registerSettingsHandlers(settingsPath, (settings) => {
    // When settings change, sync workspace path to the workspace service.
    // This replaces the old hidden coupling between settings.ts and fs.ts.
    // Guard: WorkspaceService may not exist yet during initial settings load
    // (registerFsHandlers runs after this). The initial sync is handled
    // explicitly below.
    try {
      getWorkspaceService().setWorkspacePath(settings.lastWorkspacePath ?? null)
    } catch {
      // WorkspaceService not initialized yet — initial sync handled below
    }
  })

  // 3. File system (needs settings for strict mode checks)
  registerFsHandlers(getCurrentSettings)
  // Sync persisted workspace path now that WorkspaceService exists.
  getWorkspaceService().setWorkspacePath(getCurrentSettings().lastWorkspacePath ?? null)

  // 4. Context files
  registerContextHandlers(getContextDir(), getBundledContextDir())

  // 5. Search (needs settings for API keys)
  registerSearchHandlers(getCurrentSettings)

  // 6. LLM streaming (needs settings + context for system prompt)
  registerLlmHandlers({
    getSettings: getCurrentSettings,
    getSystemPrompt: () => getContextService().assembleSystemPrompt()
  })

  // 7. Dialog handlers (remain inline — they're simple and window-dependent)
  handleIpc('dialog:confirm', async (_event, options) => {
    assertObject(options, 'options')
    if (!mainWindow) return false
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 0,
      title: options.title,
      message: options.message,
      detail: options.detail
    })
    return result.response === 1
  })

  handleIpc('dialog:openTextFile', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Load Context from File',
      filters: [
        { name: 'Text Files', extensions: ['md', 'txt', 'markdown'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) return null

    try {
      return readFileSync(result.filePaths[0], 'utf-8')
    } catch {
      return null
    }
  })

  handleIpc('dialog:openAttachmentFiles', async () => {
    if (!mainWindow) return []
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Attach Files',
      filters: [
        { name: 'Text & Markdown', extensions: ['txt', 'md'] }
      ],
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) return []

    return result.filePaths.map((filePath) => {
      try {
        return { name: basename(filePath), content: readFileSync(filePath, 'utf-8') }
      } catch {
        return null
      }
    }).filter(Boolean) as { name: string; content: string }[]
  })
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  try {
    getConversationService()?.close()
  } catch {
    // Database may already be closed
  }
})
