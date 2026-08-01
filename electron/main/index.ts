import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import type { AgentConfig, AppDiagnostics, LabSession, LlmApiConfigInput, PermissionDecision } from '../../src/shared/types'
import { AgentRuntime } from './agent-runtime'
import { SessionStore } from './session-store'
import { CredentialStore } from './credential-store'
import { GitService } from './git-service'
import { FileService } from './file-service'
import { VerificationService } from './verification-service'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const sdkEntry = require.resolve('@anthropic-ai/claude-agent-sdk')
const sdkVersion = (JSON.parse(readFileSync(path.join(path.dirname(sdkEntry), 'package.json'), 'utf8')) as { version: string }).version

let mainWindow: BrowserWindow | null = null
let store: SessionStore
let runtime: AgentRuntime
let credentials: CredentialStore
const git = new GitService()
const files = new FileService()
let verifications: VerificationService

export const resolvePackagedClaudeExecutable = () => {
  if (!app.isPackaged) return undefined
  const packageName = `claude-agent-sdk-${process.platform}-${process.arch}`
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude'
  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai')
  const candidates = [
    path.join(unpackedRoot, 'claude-agent-sdk', 'node_modules', '@anthropic-ai', packageName, binaryName),
    path.join(unpackedRoot, packageName, binaryName),
  ]
  const executable = candidates.find((candidate) => existsSync(candidate))
  if (!executable) throw new Error(`Packaged Claude executable not found for ${process.platform}-${process.arch}`)
  return executable
}

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
      apiKeyConfigured: credentials.publicConfig().apiKeyConfigured,
      userDataPath: app.getPath('userData'),
      databasePath: store.databasePath,
      productVersion: app.getVersion(),
    }
    return { ...persisted, diagnostics, llmConfig: credentials.publicConfig() }
  })

  const projectRootFor = async (candidatePath: string) => {
    const status = await git.status(candidatePath)
    return status.available && status.repoRoot ? status.repoRoot : path.resolve(candidatePath)
  }
  ipcMain.handle('project:list', () => store.listProjects())
  ipcMain.handle('project:create', async (_event, rootPath: string) => store.createProject(await projectRootFor(rootPath)))
  ipcMain.handle('session:create', async (_event, config?: Partial<AgentConfig>, projectId?: string) => {
    const normalized = config?.cwd ? { ...config, cwd: await projectRootFor(config.cwd) } : config
    return store.create(normalized, projectId)
  })
  ipcMain.handle(
    'session:update',
    async (_event, sessionId: string, patch: Partial<Pick<LabSession, 'title' | 'config'>>) => {
      const normalized = patch.config?.cwd ? { ...patch, config: { ...patch.config, cwd: await projectRootFor(patch.config.cwd) } } : patch
      return store.update(sessionId, normalized)
    },
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
  ipcMain.handle('llm:get-config', () => credentials.publicConfig())
  ipcMain.handle('llm:save-config', (_event, config: LlmApiConfigInput) => credentials.save(config))
  ipcMain.handle('llm:clear-config', () => credentials.clear())
  const cwdFor = (sessionId: string) => store.get(sessionId).config.cwd
  ipcMain.handle('git:status', (_event, sessionId: string) => git.status(cwdFor(sessionId)))
  ipcMain.handle('git:diff', (_event, sessionId: string, scope: 'unstaged' | 'staged') => git.diff(cwdFor(sessionId), scope))
  ipcMain.handle('git:stage-file', (_event, sessionId: string, filePath: string, token: string) => git.stageFile(cwdFor(sessionId), filePath, token))
  ipcMain.handle('git:unstage-file', (_event, sessionId: string, filePath: string, token: string) => git.unstageFile(cwdFor(sessionId), filePath, token))
  ipcMain.handle('git:apply-patch', (_event, sessionId: string, patch: string, operation: 'stage' | 'unstage' | 'revert', token: string) => git.applyPatch(cwdFor(sessionId), patch, operation, token))
  ipcMain.handle('git:revert-file', (_event, sessionId: string, filePath: string, token: string, confirmed: boolean) => git.revertFile(cwdFor(sessionId), filePath, token, confirmed))
  ipcMain.handle('git:commit', (_event, sessionId: string, message: string, token: string) => git.commit(cwdFor(sessionId), message, token))
  ipcMain.handle('files:list', (_event, sessionId: string, relativePath?: string) => files.list(cwdFor(sessionId), relativePath))
  ipcMain.handle('files:preview', (_event, sessionId: string, relativePath: string) => files.preview(cwdFor(sessionId), relativePath))
  ipcMain.handle('verification:discover', (_event, sessionId: string) => verifications.discover(sessionId))
  ipcMain.handle('verification:run', (_event, sessionId: string, commandId: string) => verifications.run(sessionId, commandId))
  ipcMain.handle('verification:list', (_event, sessionId: string) => store.listVerifications(sessionId))
  ipcMain.handle('events:list', (_event, sessionId: string, limit?: number, before?: number) => store.listEvents(sessionId, limit, before))
  ipcMain.handle('subagents:list', (_event, sessionId: string) => store.listSubagents(sessionId))
}

app.whenReady().then(async () => {
  store = new SessionStore(app.getPath('userData'), homedir())
  credentials = new CredentialStore(app.getPath('userData'), safeStorage)
  await credentials.load()
  await store.load()
  verifications = new VerificationService(store)
  if (store.snapshot().sessions.length === 0) await store.create()
  runtime = new AgentRuntime(
    store,
    (event) => mainWindow?.webContents.send('agent:event', event),
    (request) => mainWindow?.webContents.send('agent:permission', request),
    () => credentials.environment(),
    resolvePackagedClaudeExecutable,
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
