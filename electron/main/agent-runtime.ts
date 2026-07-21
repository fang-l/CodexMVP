import { randomUUID } from 'node:crypto'
import {
  query,
  type AgentDefinition,
  type HookCallback,
  type McpServerConfig,
  type Options,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SdkPluginConfig,
} from '@anthropic-ai/claude-agent-sdk'
import type {
  ChatMessage,
  LabSession,
  PermissionDecision,
  PermissionRequest,
  RunSummary,
  RuntimeEvent,
} from '../../src/shared/types'
import type { SessionStore } from './session-store'

interface PermissionWaiter {
  resolve: (result: PermissionResult) => void
  suggestions?: PermissionUpdate[]
  input: Record<string, unknown>
}

type EventSink = (event: RuntimeEvent) => void
type PermissionSink = (request: PermissionRequest) => void

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const parseJson = <T>(source: string, label: string, fallback: T): T => {
  if (!source.trim()) return fallback
  try {
    return JSON.parse(source) as T
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

export class AgentRuntime {
  private readonly queries = new Map<string, Query>()
  private readonly abortControllers = new Map<string, AbortController>()
  private readonly pendingPermissions = new Map<string, PermissionWaiter>()

  constructor(
    private readonly store: SessionStore,
    private readonly emit: EventSink,
    private readonly requestPermission: PermissionSink,
  ) {}

  async run(sessionId: string, prompt: string) {
    const session = this.store.get(sessionId)
    if (session.status === 'running' || session.status === 'waiting_permission') {
      throw new Error('这个会话仍在运行，请先停止当前任务。')
    }

    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: prompt,
      createdAt: Date.now(),
    }
    await this.store.addMessage(sessionId, userMessage)
    await this.store.update(sessionId, { status: 'running' })
    this.event(sessionId, 'status', 'Agent 正在运行', 'running')

    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)

    try {
      const options = this.buildOptions(session, abortController)
      const activeQuery = query({ prompt, options })
      this.queries.set(sessionId, activeQuery)

      for await (const message of activeQuery) {
        await this.handleMessage(sessionId, message)
      }
      await this.store.update(sessionId, { status: 'idle' })
      this.event(sessionId, 'status', 'Agent 已空闲', 'idle')
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      const aborted = abortController.signal.aborted
      await this.store.addMessage(sessionId, {
        id: randomUUID(),
        role: aborted ? 'system' : 'error',
        content: aborted ? '任务已由用户停止。' : text,
        createdAt: Date.now(),
      })
      await this.store.update(sessionId, { status: aborted ? 'idle' : 'error' })
      this.event(sessionId, aborted ? 'status' : 'error', aborted ? '任务已停止' : '运行失败', text, { error: text })
    } finally {
      this.queries.delete(sessionId)
      this.abortControllers.delete(sessionId)
      for (const [requestId, pending] of this.pendingPermissions) {
        pending.resolve({ behavior: 'deny', message: 'Agent run ended before a decision was made.' })
        this.pendingPermissions.delete(requestId)
      }
    }
  }

  async interrupt(sessionId: string) {
    this.abortControllers.get(sessionId)?.abort('User interrupted the run')
    await this.queries.get(sessionId)?.interrupt().catch(() => undefined)
  }

  async resolvePermission(requestId: string, decision: PermissionDecision) {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) throw new Error('这个权限请求已经失效。')
    this.pendingPermissions.delete(requestId)

    if (decision === 'deny') {
      pending.resolve({
        behavior: 'deny',
        message: '用户在 AgentLab 中拒绝了此操作。',
        decisionClassification: 'user_reject',
      })
      return
    }

    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input,
      updatedPermissions: decision === 'allow_session' ? pending.suggestions : undefined,
      decisionClassification: decision === 'allow_session' ? 'user_permanent' : 'user_temporary',
    })
  }

  private buildOptions(session: LabSession, abortController: AbortController): Options {
    const config = session.config
    const mcpServers = parseJson<Record<string, McpServerConfig>>(config.mcpServersJson, 'MCP Servers', {})
    const agents = parseJson<Record<string, AgentDefinition>>(config.agentsJson, 'Subagents', {})
    const plugins = parseJson<SdkPluginConfig[]>(config.pluginsJson, 'Plugins', [])
    const outputSchema = parseJson<Record<string, unknown> | null>(config.outputSchemaJson, 'Output Schema', null)

    const hook: HookCallback = async (input, toolUseId) => {
      const payload = asRecord(input)
      const label = String(payload.hook_event_name ?? 'Hook')
      this.event(session.id, 'hook', label, undefined, payload, { toolUseId })
      return {}
    }

    const options: Options = {
      abortController,
      cwd: config.cwd || process.cwd(),
      model: config.model || undefined,
      fallbackModel: config.fallbackModel || undefined,
      permissionMode: config.permissionMode,
      allowDangerouslySkipPermissions: config.permissionMode === 'bypassPermissions',
      effort: config.effort,
      thinking:
        config.thinking.mode === 'enabled'
          ? { type: 'enabled', budgetTokens: config.thinking.budgetTokens }
          : { type: config.thinking.mode },
      maxTurns: config.maxTurns || undefined,
      maxBudgetUsd: config.maxBudgetUsd || undefined,
      tools: config.tools,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      additionalDirectories: config.additionalDirectories,
      settingSources: config.settingSources,
      systemPrompt: config.useClaudeCodePreset
        ? { type: 'preset', preset: 'claude_code', append: config.systemPrompt || undefined }
        : config.systemPrompt || undefined,
      includePartialMessages: config.includePartialMessages,
      includeHookEvents: config.includeHookEvents,
      forwardSubagentText: config.forwardSubagentText,
      enableFileCheckpointing: config.enableFileCheckpointing,
      promptSuggestions: config.promptSuggestions,
      sandbox: { enabled: config.sandboxEnabled },
      strictMcpConfig: config.strictMcpConfig,
      mcpServers,
      agents,
      plugins,
      outputFormat: outputSchema ? { type: 'json_schema', schema: outputSchema } : undefined,
      resume: session.sdkSessionId,
      persistSession: true,
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'agent-lab-desktop/0.1.0',
      },
      hooks: {
        PreToolUse: [{ hooks: [hook] }],
        PostToolUse: [{ hooks: [hook] }],
        PostToolUseFailure: [{ hooks: [hook] }],
        SubagentStart: [{ hooks: [hook] }],
        SubagentStop: [{ hooks: [hook] }],
        PreCompact: [{ hooks: [hook] }],
        PostCompact: [{ hooks: [hook] }],
        Stop: [{ hooks: [hook] }],
      },
      canUseTool: async (toolName, input, details) => {
        const requestId = details.requestId || randomUUID()
        await this.store.update(session.id, { status: 'waiting_permission' })
        this.pendingPermissions.set(requestId, {
          resolve: () => undefined,
          suggestions: details.suggestions,
          input,
        })

        const result = await new Promise<PermissionResult>((resolve, reject) => {
          const pending = this.pendingPermissions.get(requestId)
          if (!pending) return reject(new Error('Permission request was cancelled.'))
          pending.resolve = resolve
          details.signal.addEventListener(
            'abort',
            () => {
              this.pendingPermissions.delete(requestId)
              resolve({ behavior: 'deny', message: 'Permission request aborted.' })
            },
            { once: true },
          )
          this.requestPermission({
            id: requestId,
            sessionId: session.id,
            toolName,
            toolUseId: details.toolUseID,
            title: details.title,
            displayName: details.displayName,
            description: details.description,
            decisionReason: details.decisionReason,
            blockedPath: details.blockedPath,
            input,
            hasSuggestions: Boolean(details.suggestions?.length),
          })
          this.event(session.id, 'permission', `等待授权：${toolName}`, details.title, input, {
            toolName,
            toolUseId: details.toolUseID,
          })
        })

        await this.store.update(session.id, { status: 'running' })
        return result
      },
    }

    return options
  }

  private async handleMessage(sessionId: string, message: SDKMessage) {
    const record = message as unknown as Record<string, unknown>
    const sdkSessionId = typeof record.session_id === 'string' ? record.session_id : undefined
    if (sdkSessionId) {
      const session = this.store.get(sessionId)
      if (session.sdkSessionId !== sdkSessionId) await this.store.update(sessionId, { sdkSessionId })
    }

    if (message.type === 'stream_event') {
      const event = asRecord(message.event)
      if (event.type === 'content_block_delta') {
        const delta = asRecord(event.delta)
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          this.event(sessionId, 'assistant_delta', '文本流', delta.text, undefined, { sdkSessionId })
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          this.event(sessionId, 'thinking', 'Thinking', delta.thinking, undefined, { sdkSessionId })
        }
      }
      return
    }

    if (message.type === 'assistant') {
      const content = Array.isArray(message.message.content) ? message.message.content : []
      const textParts: string[] = []
      for (const blockValue of content) {
        const block = asRecord(blockValue)
        if (block.type === 'text' && typeof block.text === 'string') textParts.push(block.text)
        if (block.type === 'thinking' && typeof block.thinking === 'string') {
          this.event(sessionId, 'thinking', 'Thinking 完成', block.thinking, block, {
            parentToolUseId: message.parent_tool_use_id,
          })
        }
        if (block.type === 'tool_use') {
          this.event(sessionId, 'tool_use', String(block.name ?? 'Tool'), undefined, block.input, {
            toolName: String(block.name ?? 'Tool'),
            toolUseId: String(block.id ?? ''),
            parentToolUseId: message.parent_tool_use_id,
          })
        }
      }
      const text = textParts.join('\n')
      if (text) {
        await this.store.addMessage(sessionId, {
          id: message.uuid,
          role: 'assistant',
          content: text,
          createdAt: Date.now(),
          metadata: { parentToolUseId: message.parent_tool_use_id },
        })
        this.event(sessionId, 'assistant', 'Claude Agent', text, undefined, {
          sdkSessionId,
          parentToolUseId: message.parent_tool_use_id,
          data: { messageId: message.uuid },
        })
      }
      return
    }

    if (message.type === 'user') {
      const content = asRecord(message.message).content
      if (Array.isArray(content)) {
        for (const blockValue of content) {
          const block = asRecord(blockValue)
          if (block.type === 'tool_result') {
            this.event(sessionId, 'tool_result', '工具结果', undefined, block.content, {
              toolUseId: String(block.tool_use_id ?? ''),
              parentToolUseId: message.parent_tool_use_id,
            })
          }
        }
      }
      return
    }

    if (message.type === 'result') {
      const summary: RunSummary = {
        subtype: message.subtype,
        durationMs: message.duration_ms,
        durationApiMs: message.duration_api_ms,
        turns: message.num_turns,
        costUsd: message.total_cost_usd,
        stopReason: message.stop_reason,
        isError: message.is_error,
        usage: message.usage as unknown as Record<string, unknown>,
        permissionDenials: message.permission_denials,
      }
      await this.store.update(sessionId, { lastResult: summary })
      this.event(sessionId, 'result', message.subtype === 'success' ? '运行完成' : '运行结束（有错误）', undefined, summary)
      return
    }

    if (message.type === 'system') {
      const subtype = String(record.subtype ?? 'system')
      if (subtype === 'prompt_suggestion' && typeof record.suggestion === 'string') {
        this.event(sessionId, 'prompt_suggestion', '下一步建议', record.suggestion, record)
      } else {
        this.event(sessionId, 'system', subtype, typeof record.status === 'string' ? record.status : undefined, record)
      }
      return
    }

    this.event(sessionId, 'system', message.type, undefined, record)
  }

  private event(
    sessionId: string,
    kind: RuntimeEvent['kind'],
    label: string,
    text?: string,
    data?: unknown,
    extra: Partial<RuntimeEvent> = {},
  ) {
    this.emit({ id: randomUUID(), sessionId, timestamp: Date.now(), kind, label, text, data, ...extra })
  }
}
