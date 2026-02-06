import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { DatabaseManager } from './ipc/db'
import { registerContextHandlers } from './ipc/context'
import { registerSettingsHandlers } from './ipc/settings'
import { registerFsHandlers } from './ipc/fs'
import { registerLlmHandlers } from './ipc/llm'
import { registerSearchHandlers } from './ipc/search'

let mainWindow: BrowserWindow | null = null

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

  // Register all IPC handlers
  registerIpcHandlers()

  // Load the app
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    const url = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    mainWindow.loadURL(url)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC Handler Registration ────────────────────────────────────────────────

function registerIpcHandlers(): void {
  if (!mainWindow) return

  // Dialog handler
  ipcMain.handle('dialog:confirm', async (_event, options: { title: string; message: string; detail?: string }) => {
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

  // Open file dialog — returns the text content of a user-selected file, or null if cancelled
  ipcMain.handle('dialog:openTextFile', async () => {
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

  // Register module-specific handlers
  registerContextHandlers()
  registerSettingsHandlers()
  registerFsHandlers(mainWindow)
  registerLlmHandlers(mainWindow)
  registerSearchHandlers()
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Initialize database
  DatabaseManager.getInstance()

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
  // Close database connection
  try {
    DatabaseManager.getInstance().close()
  } catch {
    // Database may already be closed
  }
})
