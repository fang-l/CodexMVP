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
