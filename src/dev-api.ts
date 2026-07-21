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
  const snapshot = (): AppSnapshot => ({
    sessions: structuredClone(sessions),
    activeSessionId: sessions[0]?.id,
    diagnostics: {
      platform: 'darwin', arch: 'arm64', nodeVersion: '22.x', electronVersion: '35.x',
      sdkVersion: '0.3.216', apiKeyConfigured: false, userDataPath: '/preview/AgentLab',
    },
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
    onEvent: (listener) => { eventListeners.add(listener); return () => eventListeners.delete(listener) },
    onPermission: (listener) => { permissionListeners.add(listener); return () => permissionListeners.delete(listener) },
  }
}
