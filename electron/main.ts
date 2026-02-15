import { app, BrowserWindow, dialog, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { join, basename, extname } from 'path'
import { readFileSync } from 'fs'
import { extractPdfTextWithFallback } from './services/PdfAttachmentService'
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

const APP_NAME = app.getName().split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const ABOUT_AUTHOR = 'D. Cusanelli'
const ABOUT_DESCRIPTION = 'Context Aware Command Center'

async function showHelpPopup(
  title: string,
  message: string,
  detail: string
): Promise<void> {
  if (!mainWindow) return

  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['Close'],
    defaultId: 0,
    noLink: true,
    title,
    message,
    detail
  })
}

function setApplicationMenu(): void {
  const aboutDetail = [
    `Name: ${APP_NAME}`,
    `Version: ${app.getVersion()}`,
    `Author: ${ABOUT_AUTHOR}`,
    `Description: ${ABOUT_DESCRIPTION}`
  ].join('\n')

  const gettingStartedDetail = [
    '1. Choose your LLM provider in Settings.',
    '2. Enter your API key if available. \(OpenRouter recommended\)',
    '3. Enter your Search API key if using web search. \(Tavily recommended\)',
    '4. Open Workspace and choose your active folder.',
    '5. Set the System Prompt in the Context section.'
  ].join('\n')

  const menuTemplate: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            void showHelpPopup(
              `About ${APP_NAME}`,
              APP_NAME,
              aboutDetail
            )
          }
        },
        {
          label: 'Getting Started',
          click: () => {
            void showHelpPopup(
              'Getting Started',
              `How to use ${APP_NAME}`,
              gettingStartedDetail
            )
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
}

interface ParsedAttachment {
  name: string
  content: string
}

async function parseAttachmentFile(filePath: string): Promise<ParsedAttachment> {
  const fileName = basename(filePath)
  const extension = extname(filePath).toLowerCase()

  if (extension === '.pdf') {
    return {
      name: fileName,
      content: await extractPdfTextWithFallback(filePath)
    }
  }

  return {
    name: fileName,
    content: readFileSync(filePath, 'utf-8')
  }
}

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
  const prefersDarkMode = (() => {
    try {
      return getCurrentSettings().darkMode
    } catch {
      return false
    }
  })()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Red Ledger',
    backgroundColor: prefersDarkMode ? '#1F1A19' : '#FDFCF8',
    icon: join(__dirname, '../../build/icon.png'),
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
        { name: 'Text, Markdown, PDF', extensions: ['txt', 'md', 'pdf'] }
      ],
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) return []

    const parsed = await Promise.all(result.filePaths.map(async (filePath) => {
      try {
        const attachment = await parseAttachmentFile(filePath)
        return { ok: true as const, attachment }
      } catch {
        return { ok: false as const, name: basename(filePath) }
      }
    }))

    const attachments = parsed
      .filter((result): result is { ok: true; attachment: ParsedAttachment } => result.ok)
      .map((result) => result.attachment)

    const failed = parsed
      .filter((result): result is { ok: false; name: string } => !result.ok)
      .map((result) => result.name)

    if (failed.length > 0) {
      await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['OK'],
        defaultId: 0,
        title: 'Attachment Parsing Failed',
        message: 'Some files could not be attached.',
        detail: failed.join('\n')
      })
    }

    return attachments
  })
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers()

  createWindow()
  setApplicationMenu()

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
