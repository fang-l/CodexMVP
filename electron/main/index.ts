import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import type { AgentConfig, AppDiagnostics, LabSession, PermissionDecision } from '../../src/shared/types'
import { AgentRuntime } from './agent-runtime'
import { SessionStore } from './session-store'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sdkEntry = require.resolve('@anthropic-ai/claude-agent-sdk')
const sdkVersion = (JSON.parse(readFileSync(path.join(path.dirname(sdkEntry), 'package.json'), 'utf8')) as { version: string }).version

let mainWindow: BrowserWindow | null = null
let store: SessionStore
let runtime: AgentRuntime

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1080,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4f1e8',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(currentDirectory, 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    await mainWindow.loadFile(path.join(currentDirectory, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
}

const registerIpc = () => {
  ipcMain.handle('app:load', async () => {
    const persisted = store.snapshot()
    const diagnostics: AppDiagnostics = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
      sdkVersion,
      apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      userDataPath: app.getPath('userData'),
    }
    return { ...persisted, diagnostics }
  })

  ipcMain.handle('session:create', (_event, config?: Partial<AgentConfig>) => store.create(config))
  ipcMain.handle(
    'session:update',
    (_event, sessionId: string, patch: Partial<Pick<LabSession, 'title' | 'config'>>) => store.update(sessionId, patch),
  )
  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    await runtime.interrupt(sessionId)
    await store.delete(sessionId)
  })
  ipcMain.handle('agent:send', async (_event, sessionId: string, prompt: string) => {
    if (!prompt.trim()) return
    void runtime.run(sessionId, prompt.trim())
  })
  ipcMain.handle('agent:interrupt', (_event, sessionId: string) => runtime.interrupt(sessionId))
  ipcMain.handle('permission:resolve', (_event, requestId: string, decision: PermissionDecision) =>
    runtime.resolvePermission(requestId, decision),
  )
  ipcMain.handle('dialog:choose-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('shell:reveal-path', async (_event, targetPath: string) => shell.openPath(targetPath))
}

app.whenReady().then(async () => {
  store = new SessionStore(app.getPath('userData'), homedir())
  await store.load()
  if (store.snapshot().sessions.length === 0) await store.create()
  runtime = new AgentRuntime(
    store,
    (event) => mainWindow?.webContents.send('agent:event', event),
    (request) => mainWindow?.webContents.send('agent:permission', request),
  )
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
