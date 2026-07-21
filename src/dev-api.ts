import type { AgentLabApi, AppSnapshot, LabSession, PermissionRequest, RuntimeEvent } from './shared/types'
import { createDefaultConfig } from './shared/types'

export function createBrowserPreviewApi(): AgentLabApi {
  const now = Date.now()
  let sessions: LabSession[] = [{
    id: 'preview-session',
    title: 'Claude Agent SDK 实验',
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    config: createDefaultConfig('/Users/you/Projects/example-app'),
    messages: [],
  }]
  const eventListeners = new Set<(event: RuntimeEvent) => void>()
  const permissionListeners = new Set<(request: PermissionRequest) => void>()
  let llmConfig: AppSnapshot['llmConfig'] = { provider: 'anthropic', baseUrl: '', model: '', authMode: 'api_key', apiKeyConfigured: false, maskedApiKey: '', source: 'none', encryptionAvailable: true }
  const snapshot = (): AppSnapshot => ({
    sessions: structuredClone(sessions),
    activeSessionId: sessions[0]?.id,
    diagnostics: {
      platform: 'darwin', arch: 'arm64', nodeVersion: '22.x', electronVersion: '35.x',
      sdkVersion: '0.3.216', apiKeyConfigured: false, userDataPath: '/preview/AgentLab',
    },
    llmConfig,
  })
  return {
    load: async () => snapshot(),
    createSession: async (config) => {
      const session: LabSession = { id: crypto.randomUUID(), title: '新实验', createdAt: Date.now(), updatedAt: Date.now(), status: 'idle', config: { ...createDefaultConfig('/Users/you/Projects/example-app'), ...config }, messages: [] }
      sessions = [session, ...sessions]
      return structuredClone(session)
    },
    updateSession: async (sessionId, patch) => {
      sessions = sessions.map((session) => session.id === sessionId ? { ...session, ...patch, config: patch.config ? { ...session.config, ...patch.config } : session.config } : session)
      return structuredClone(sessions.find((session) => session.id === sessionId)!)
    },
    deleteSession: async (sessionId) => { sessions = sessions.filter((session) => session.id !== sessionId) },
    sendMessage: async () => undefined,
    interrupt: async () => undefined,
    resolvePermission: async () => undefined,
    chooseDirectory: async () => null,
    revealPath: async () => undefined,
    getLlmConfig: async () => structuredClone(llmConfig),
    saveLlmConfig: async (input) => {
      llmConfig = { provider: input.provider, baseUrl: input.baseUrl, model: input.model, authMode: input.authMode, apiKeyConfigured: Boolean(input.apiKey) || llmConfig.apiKeyConfigured, maskedApiKey: input.apiKey ? `••••••••${input.apiKey.slice(-4)}` : llmConfig.maskedApiKey, source: 'app', encryptionAvailable: true, updatedAt: Date.now() }
      return structuredClone(llmConfig)
    },
    clearLlmConfig: async () => {
      llmConfig = { provider: 'anthropic', baseUrl: '', model: '', authMode: 'api_key', apiKeyConfigured: false, maskedApiKey: '', source: 'none', encryptionAvailable: true }
      return structuredClone(llmConfig)
    },
    onEvent: (listener) => { eventListeners.add(listener); return () => eventListeners.delete(listener) },
    onPermission: (listener) => { permissionListeners.add(listener); return () => permissionListeners.delete(listener) },
  }
}
