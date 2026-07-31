export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'dontAsk'
  | 'auto'
  | 'bypassPermissions'

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type SettingSource = 'user' | 'project' | 'local'
export type LlmProvider = 'anthropic' | 'compatible' | 'environment'
export type LlmAuthMode = 'api_key' | 'bearer'

export interface LlmApiConfigInput {
  provider: LlmProvider
  baseUrl: string
  model: string
  authMode: LlmAuthMode
  apiKey: string
}

export interface LlmApiConfigPublic {
  provider: LlmProvider
  baseUrl: string
  model: string
  authMode: LlmAuthMode
  apiKeyConfigured: boolean
  maskedApiKey: string
  source: 'app' | 'environment' | 'none'
  encryptionAvailable: boolean
  updatedAt?: number
}

export interface ThinkingConfig {
  mode: 'adaptive' | 'enabled' | 'disabled'
  budgetTokens: number
}

export interface AgentConfig {
  cwd: string
  model: string
  fallbackModel: string
  permissionMode: PermissionMode
  effort: EffortLevel
  thinking: ThinkingConfig
  maxTurns: number
  maxBudgetUsd: number
  tools: string[]
  allowedTools: string[]
  disallowedTools: string[]
  additionalDirectories: string[]
  settingSources: SettingSource[]
  useClaudeCodePreset: boolean
  systemPrompt: string
  includePartialMessages: boolean
  includeHookEvents: boolean
  forwardSubagentText: boolean
  enableFileCheckpointing: boolean
  promptSuggestions: boolean
  sandboxEnabled: boolean
  strictMcpConfig: boolean
  mcpServersJson: string
  agentsJson: string
  pluginsJson: string
  outputSchemaJson: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'error'
  content: string
  createdAt: number
  metadata?: Record<string, unknown>
}

export interface LabSession {
  id: string
  sdkSessionId?: string
  title: string
  createdAt: number
  updatedAt: number
  status: 'idle' | 'running' | 'waiting_permission' | 'error'
  config: AgentConfig
  messages: ChatMessage[]
  lastResult?: RunSummary
}

export type RuntimeEventKind =
  | 'system_context'
  | 'assistant_delta'
  | 'assistant'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'permission'
  | 'hook'
  | 'status'
  | 'system'
  | 'result'
  | 'prompt_suggestion'
  | 'error'

export interface RuntimeEvent {
  id: string
  sessionId: string
  sdkSessionId?: string
  timestamp: number
  kind: RuntimeEventKind
  label: string
  text?: string
  toolName?: string
  toolUseId?: string
  parentToolUseId?: string | null
  data?: unknown
  raw?: unknown
}

export interface RunSummary {
  subtype: string
  durationMs: number
  durationApiMs: number
  turns: number
  costUsd: number
  stopReason: string | null
  isError: boolean
  usage?: Record<string, unknown>
  permissionDenials?: unknown[]
}

export interface PermissionRequest {
  id: string
  sessionId: string
  toolName: string
  toolUseId: string
  title?: string
  displayName?: string
  description?: string
  decisionReason?: string
  blockedPath?: string
  input: Record<string, unknown>
  hasSuggestions: boolean
}

export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny'

export interface AppDiagnostics {
  platform: string
  arch: string
  nodeVersion: string
  electronVersion: string
  sdkVersion: string
  apiKeyConfigured: boolean
  userDataPath: string
}

export interface AppSnapshot {
  sessions: LabSession[]
  activeSessionId?: string
  diagnostics: AppDiagnostics
  llmConfig: LlmApiConfigPublic
}

export interface AgentLabApi {
  load(): Promise<AppSnapshot>
  createSession(config?: Partial<AgentConfig>): Promise<LabSession>
  updateSession(sessionId: string, patch: Partial<Pick<LabSession, 'title' | 'config'>>): Promise<LabSession>
  deleteSession(sessionId: string): Promise<void>
  sendMessage(sessionId: string, prompt: string): Promise<void>
  interrupt(sessionId: string): Promise<void>
  resolvePermission(requestId: string, decision: PermissionDecision): Promise<void>
  chooseDirectory(): Promise<string | null>
  revealPath(path: string): Promise<void>
  getLlmConfig(): Promise<LlmApiConfigPublic>
  saveLlmConfig(config: LlmApiConfigInput): Promise<LlmApiConfigPublic>
  clearLlmConfig(): Promise<LlmApiConfigPublic>
  onEvent(listener: (event: RuntimeEvent) => void): () => void
  onPermission(listener: (request: PermissionRequest) => void): () => void
}

export const DEFAULT_TOOLS = ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'WebSearch', 'WebFetch', 'Agent']

export const createDefaultConfig = (cwd = ''): AgentConfig => ({
  cwd,
  model: '',
  fallbackModel: '',
  permissionMode: 'default',
  effort: 'high',
  thinking: { mode: 'adaptive', budgetTokens: 10_000 },
  maxTurns: 25,
  maxBudgetUsd: 5,
  tools: [...DEFAULT_TOOLS],
  allowedTools: ['Read', 'Glob', 'Grep'],
  disallowedTools: [],
  additionalDirectories: [],
  settingSources: ['project', 'local'],
  useClaudeCodePreset: true,
  systemPrompt: 'You are working inside AgentLab. Explain important actions concisely and verify code changes.',
  includePartialMessages: true,
  includeHookEvents: true,
  forwardSubagentText: true,
  enableFileCheckpointing: true,
  promptSuggestions: true,
  sandboxEnabled: true,
  strictMcpConfig: false,
  mcpServersJson: '{}',
  agentsJson: JSON.stringify(
    {
      reviewer: {
        description: 'Reviews code for correctness, maintainability, and security.',
        prompt: 'Review the requested code carefully. Report concrete findings with file evidence.',
        tools: ['Read', 'Glob', 'Grep'],
        model: 'inherit',
        maxTurns: 12,
      },
    },
    null,
    2,
  ),
  pluginsJson: '[]',
  outputSchemaJson: '',
})
