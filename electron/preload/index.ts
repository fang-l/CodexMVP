import { contextBridge, ipcRenderer } from 'electron'
import type { AgentLabApi, PermissionRequest, RuntimeEvent } from '../../src/shared/types'

const api: AgentLabApi = {
  load: () => ipcRenderer.invoke('app:load'),
  createSession: (config) => ipcRenderer.invoke('session:create', config),
  updateSession: (sessionId, patch) => ipcRenderer.invoke('session:update', sessionId, patch),
  deleteSession: (sessionId) => ipcRenderer.invoke('session:delete', sessionId),
  sendMessage: (sessionId, prompt) => ipcRenderer.invoke('agent:send', sessionId, prompt),
  interrupt: (sessionId) => ipcRenderer.invoke('agent:interrupt', sessionId),
  resolvePermission: (requestId, decision) => ipcRenderer.invoke('permission:resolve', requestId, decision),
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  revealPath: (path) => ipcRenderer.invoke('shell:reveal-path', path),
  getLlmConfig: () => ipcRenderer.invoke('llm:get-config'),
  saveLlmConfig: (config) => ipcRenderer.invoke('llm:save-config', config),
  clearLlmConfig: () => ipcRenderer.invoke('llm:clear-config'),
  getGitStatus: (sessionId) => ipcRenderer.invoke('git:status', sessionId),
  getGitDiff: (sessionId, scope) => ipcRenderer.invoke('git:diff', sessionId, scope),
  stageGitFile: (sessionId, path, token) => ipcRenderer.invoke('git:stage-file', sessionId, path, token),
  unstageGitFile: (sessionId, path, token) => ipcRenderer.invoke('git:unstage-file', sessionId, path, token),
  applyGitPatch: (sessionId, patch, operation, token) => ipcRenderer.invoke('git:apply-patch', sessionId, patch, operation, token),
  revertGitFile: (sessionId, path, token, confirmed) => ipcRenderer.invoke('git:revert-file', sessionId, path, token, confirmed),
  commitGit: (sessionId, message, token) => ipcRenderer.invoke('git:commit', sessionId, message, token),
  listFiles: (sessionId, relativePath) => ipcRenderer.invoke('files:list', sessionId, relativePath),
  readFilePreview: (sessionId, relativePath) => ipcRenderer.invoke('files:preview', sessionId, relativePath),
  discoverVerifications: (sessionId) => ipcRenderer.invoke('verification:discover', sessionId),
  runVerification: (sessionId, commandId) => ipcRenderer.invoke('verification:run', sessionId, commandId),
  listVerifications: (sessionId) => ipcRenderer.invoke('verification:list', sessionId),
  listPersistedEvents: (sessionId, limit, before) => ipcRenderer.invoke('events:list', sessionId, limit, before),
  listSubagents: (sessionId) => ipcRenderer.invoke('subagents:list', sessionId),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RuntimeEvent) => listener(payload)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
  onPermission: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: PermissionRequest) => listener(payload)
    ipcRenderer.on('agent:permission', handler)
    return () => ipcRenderer.removeListener('agent:permission', handler)
  },
}

contextBridge.exposeInMainWorld('agentLab', api)
