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
  SubagentRun,
} from '../../src/shared/types'
import type { SessionStore } from './session-store'
import { createSafeRunContext } from './safe-run-context'
import { decideSubagentTool, isTerminalSubagentStatus } from './subagent-policy'

interface PermissionWaiter {
  id: string
  sessionId: string
  turnId?: string
  agentId?: string
  toolName: string
  toolUseId: string
  resolve: (result: PermissionResult) => void
  suggestions?: PermissionUpdate[]
  input: Record<string, unknown>
}

interface ActiveRun {
  abortController: AbortController
  query?: Query
  turnId: string
  pendingResult?: RunSummary
  subagents: Map<string, SubagentRun>
  agentTypes: Map<string, string>
  liveBackgroundTaskIds: Set<string>
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

const MARKDOWN_OUTPUT_INSTRUCTION =
  'When the user asks you to return or render Markdown, output the Markdown directly. Do not wrap the entire response in a fenced code block unless the user explicitly asks to see Markdown source code.'

const subagentStatus = (value: unknown): SubagentRun['status'] => {
  if (value === 'completed' || value === 'failed' || value === 'stopped' || value === 'killed') return value
  if (value === 'pending') return 'pending'
  return 'running'
}

export class AgentRuntime {
  private readonly runs = new Map<string, ActiveRun>()
  private readonly pendingPermissions = new Map<string, PermissionWaiter>()

  constructor(
    private readonly store: SessionStore,
    private readonly emit: EventSink,
    private readonly requestPermission: PermissionSink,
    private readonly getLlmEnvironment: () => Record<string, string | undefined>,
    private readonly getClaudeExecutablePath: () => string | undefined,
  ) {}

  async run(sessionId: string, prompt: string) {
    const session = this.store.get(sessionId)
    if (this.runs.has(sessionId)) {
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
    const run: ActiveRun = {
      abortController,
      turnId: this.store.beginTurn(sessionId, prompt),
      subagents: new Map(),
      agentTypes: new Map(),
      liveBackgroundTaskIds: new Set(),
    }
    this.runs.set(sessionId, run)

    try {
      const options = this.buildOptions(session, run, prompt)
      const activeQuery = query({ prompt, options })
      run.query = activeQuery

      for await (const message of activeQuery) {
        // A stopped run may take time to unwind inside the SDK.  Do not let its
        // late events or cleanup interfere with a newer prompt in this session.
        if (this.runs.get(sessionId) !== run) break
        await this.handleMessage(sessionId, message, run)
      }
      await this.finishRun(sessionId, run)
    } catch (error) {
      if (this.runs.get(sessionId) !== run) return
      const text = error instanceof Error ? error.message : String(error)
      const aborted = abortController.signal.aborted
      await this.store.addMessage(sessionId, {
        id: randomUUID(),
        role: aborted ? 'system' : 'error',
        content: aborted ? '任务已由用户停止。' : text,
        createdAt: Date.now(),
      })
      if (aborted) {
        await this.finishRun(sessionId, run, true)
      } else {
        this.runs.delete(sessionId)
        this.resolvePendingPermissions(sessionId, 'Agent run ended before a decision was made.')
        await this.store.update(sessionId, { status: 'error' })
        this.store.finishTurn(run.turnId, 'failed', 'runtime_error')
        this.event(sessionId, 'error', '运行失败', text, { error: text })
      }
    }
  }

  async interrupt(sessionId: string) {
    const run = this.runs.get(sessionId)
    if (!run) return
    run.abortController.abort('User interrupted the run')
    this.resolvePendingPermissions(sessionId, 'Permission request aborted by user.')
    // SDK interruption can wait on a child process or network operation.  It is
    // deliberately not awaited: the user must be able to type the next prompt.
    void run.query?.interrupt().catch(() => undefined)
    await this.finishRun(sessionId, run, true)
  }

  async resolvePermission(requestId: string, decision: PermissionDecision) {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) throw new Error('这个权限请求已经失效。')
    this.pendingPermissions.delete(requestId)
    this.store.savePermission({
      id: pending.id, sessionId: pending.sessionId, turnId: pending.turnId, agentId: pending.agentId,
      toolName: pending.toolName, toolUseId: pending.toolUseId, input: pending.input,
      decision, decidedAt: Date.now(),
    })

    const decisionLabel = decision === 'deny' ? '已拒绝' : decision === 'allow_session' ? '本会话允许' : '允许一次'
    this.event(pending.sessionId, 'permission', `权限决定：${pending.toolName}`, decisionLabel, {
      decision,
    }, {
      toolName: pending.toolName,
      toolUseId: pending.toolUseId,
    })

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

  private buildOptions(session: LabSession, run: ActiveRun, prompt: string): Options {
    const config = session.config
    const configuredEnvironment = this.getLlmEnvironment()
    const usesApplicationCredentials = Boolean(
      configuredEnvironment.ANTHROPIC_API_KEY ||
        configuredEnvironment.ANTHROPIC_AUTH_TOKEN ||
        configuredEnvironment.ANTHROPIC_BASE_URL,
    )
    // Never let a locally installed Claude Code profile silently replace the
    // endpoint, credentials, or model configured in AgentLab.
    const parentEnvironment = { ...process.env }
    delete parentEnvironment.ANTHROPIC_API_KEY
    delete parentEnvironment.ANTHROPIC_AUTH_TOKEN
    delete parentEnvironment.ANTHROPIC_BASE_URL
    delete parentEnvironment.ANTHROPIC_MODEL
    const sdkEnvironment = Object.fromEntries(
      Object.entries({ ...parentEnvironment, ...configuredEnvironment }).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
    const effectiveModel = config.model || configuredEnvironment.ANTHROPIC_MODEL || 'SDK 默认模型'
    const endpointHost = configuredEnvironment.ANTHROPIC_BASE_URL
      ? new URL(configuredEnvironment.ANTHROPIC_BASE_URL).host
      : 'api.anthropic.com'

    this.event(
      session.id,
      'system_context',
      '系统上下文',
      '已生成安全摘要',
      createSafeRunContext(prompt, config, effectiveModel),
    )
    const mcpServers = parseJson<Record<string, McpServerConfig>>(config.mcpServersJson, 'MCP Servers', {})
    const agents = parseJson<Record<string, AgentDefinition>>(config.agentsJson, 'Subagents', {})
    const plugins = parseJson<SdkPluginConfig[]>(config.pluginsJson, 'Plugins', [])
    const outputSchema = parseJson<Record<string, unknown> | null>(config.outputSchemaJson, 'Output Schema', null)

    const hook: HookCallback = async (input, toolUseId) => {
      const payload = asRecord(input)
      const label = String(payload.hook_event_name ?? 'Hook')
      if (label === 'SubagentStart' && typeof payload.agent_id === 'string') {
        run.agentTypes.set(payload.agent_id, String(payload.agent_type ?? 'unknown'))
      }
      this.event(session.id, 'hook', label, undefined, payload, { toolUseId })
      if (label === 'PreToolUse' && payload.tool_name === 'Agent') {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            updatedInput: { ...asRecord(payload.tool_input), run_in_background: false },
          },
        }
      }
      return {}
    }

    const sandbox = config.sandboxProfile === 'full-access'
      ? { enabled: false }
      : {
          enabled: true,
          failIfUnavailable: true,
          filesystem: {
            allowRead: [config.cwd || process.cwd(), ...config.additionalDirectories],
            allowWrite: config.sandboxProfile === 'workspace-write'
              ? [config.cwd || process.cwd(), ...config.additionalDirectories]
              : [],
          },
          network: { allowedDomains: config.networkAllowedDomains },
        }

    const options: Options = {
      abortController: run.abortController,
      cwd: config.cwd || process.cwd(),
      model: effectiveModel === 'SDK 默认模型' ? undefined : effectiveModel,
      fallbackModel: config.fallbackModel || undefined,
      pathToClaudeCodeExecutable: this.getClaudeExecutablePath(),
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
      settingSources: usesApplicationCredentials ? [] : config.settingSources,
      systemPrompt: config.useClaudeCodePreset
        ? {
            type: 'preset',
            preset: 'claude_code',
            append: [config.systemPrompt, MARKDOWN_OUTPUT_INSTRUCTION].filter(Boolean).join('\n\n'),
          }
        : [config.systemPrompt, MARKDOWN_OUTPUT_INSTRUCTION].filter(Boolean).join('\n\n'),
      includePartialMessages: config.includePartialMessages,
      includeHookEvents: config.includeHookEvents,
      forwardSubagentText: config.forwardSubagentText,
      agentProgressSummaries: true,
      enableFileCheckpointing: config.enableFileCheckpointing,
      promptSuggestions: config.promptSuggestions,
      sandbox,
      strictMcpConfig: config.strictMcpConfig,
      mcpServers,
      agents,
      plugins,
      outputFormat: outputSchema ? { type: 'json_schema', schema: outputSchema } : undefined,
      resume: session.sdkSessionId,
      persistSession: true,
      env: {
        ...sdkEnvironment,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'agent-lab-desktop/0.3.0',
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
        if (run.abortController.signal.aborted || this.runs.get(session.id) !== run) {
          return { behavior: 'deny', message: 'Agent run was stopped.' }
        }
        if (details.agentID) {
          const agentType = run.agentTypes.get(details.agentID)
          const decision = decideSubagentTool(details.agentID, toolName, agentType, agents)
          if (!decision.allowed) {
            const reason = decision.reason!
            this.event(session.id, 'permission', `子 Agent 权限拒绝：${toolName}`, reason, { agentType }, {
              toolName,
              toolUseId: details.toolUseID,
            })
            return { behavior: 'deny', message: reason }
          }
        }
        const requestId = details.requestId || randomUUID()
        await this.store.update(session.id, { status: 'waiting_permission' })
        this.pendingPermissions.set(requestId, {
          id: requestId,
          sessionId: session.id,
          turnId: run.turnId,
          agentId: details.agentID,
          toolName,
          toolUseId: details.toolUseID,
          resolve: () => undefined,
          suggestions: details.suggestions,
          input,
        })
        this.store.savePermission({
          id: requestId, sessionId: session.id, turnId: run.turnId, agentId: details.agentID,
          toolName, toolUseId: details.toolUseID, input,
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
            agentId: details.agentID,
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

        if (this.runs.get(session.id) === run) await this.store.update(session.id, { status: 'running' })
        return result
      },
    }

    this.event(session.id, 'system', '运行路由', `模型：${effectiveModel} · 端点：${endpointHost}`, {
      model: effectiveModel,
      endpointHost,
      settingsIsolated: usesApplicationCredentials,
    })

    return options
  }

  private async finishRun(sessionId: string, run: ActiveRun, interrupted = false) {
    if (this.runs.get(sessionId) !== run) return
    this.resolvePendingPermissions(sessionId, interrupted ? 'Permission request aborted by user.' : 'Agent run ended before a decision was made.')
    if (interrupted) {
      await this.store.addMessage(sessionId, {
        id: randomUUID(),
        role: 'system',
        content: '任务已由用户停止。',
        createdAt: Date.now(),
      })
    }
    const unfinished = [...run.subagents.values()].filter((item) => item.status === 'pending' || item.status === 'running')
    for (const item of unfinished) {
      const incomplete = { ...item, status: 'incomplete' as const, completedAt: Date.now(), error: 'Parent turn ended before terminal task notification.' }
      run.subagents.set(item.taskId, incomplete)
      this.store.upsertSubagent(incomplete)
      this.event(sessionId, 'subagent', `子 Agent 未完整结束：${item.description}`, incomplete.error, incomplete)
    }
    if (run.pendingResult) {
      await this.store.update(sessionId, { lastResult: run.pendingResult })
      this.event(sessionId, 'result', run.pendingResult.isError ? '运行结束（有错误）' : '运行完成', undefined, run.pendingResult)
    }
    this.store.finishTurn(run.turnId, interrupted ? 'interrupted' : run.pendingResult?.isError || unfinished.length ? 'failed' : 'completed', unfinished.length ? 'subagent_incomplete' : undefined)
    this.runs.delete(sessionId)
    await this.store.update(sessionId, { status: 'idle' })
    this.event(sessionId, 'status', interrupted ? '任务已停止' : 'Agent 已空闲', 'idle')
  }

  private resolvePendingPermissions(sessionId: string, message: string) {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.sessionId !== sessionId) continue
      this.pendingPermissions.delete(requestId)
      pending.resolve({ behavior: 'deny', message })
    }
  }

  private async handleMessage(sessionId: string, message: SDKMessage, run: ActiveRun) {
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
      run.pendingResult = summary
      return
    }

    if (message.type === 'system') {
      const subtype = String(record.subtype ?? 'system')
      if (['task_started', 'task_progress', 'task_updated', 'task_notification', 'background_tasks_changed'].includes(subtype)) {
        this.handleSubagentEvent(sessionId, subtype, record, run)
        return
      }
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
    const run = this.runs.get(sessionId)
    const event = { id: randomUUID(), sessionId, turnId: run?.turnId, timestamp: Date.now(), kind, label, text, data, ...extra }
    this.store.addEvent(event)
    this.emit(event)
  }

  private handleSubagentEvent(sessionId: string, subtype: string, record: Record<string, unknown>, run: ActiveRun) {
    if (subtype === 'background_tasks_changed') {
      const tasks = Array.isArray(record.tasks) ? record.tasks.map(asRecord) : []
      run.liveBackgroundTaskIds = new Set(tasks.map((task) => String(task.task_id ?? '')).filter(Boolean))
      this.event(sessionId, 'subagent', '后台任务集合已更新', `${run.liveBackgroundTaskIds.size} 个活动任务`, {
        taskIds: [...run.liveBackgroundTaskIds],
        replaceSemantics: true,
      })
      return
    }

    const taskId = String(record.task_id ?? '')
    if (!taskId) return
    const previous = run.subagents.get(taskId)
    const now = Date.now()
    const patch = asRecord(record.patch)
    const usage = asRecord(record.usage)
    const status = subtype === 'task_notification'
      ? subagentStatus(record.status)
      : subtype === 'task_updated'
        ? subagentStatus(patch.status ?? previous?.status)
        : previous?.status ?? 'running'
    const current: SubagentRun = {
      id: previous?.id ?? taskId,
      sessionId,
      turnId: run.turnId,
      taskId,
      agentId: previous?.agentId,
      agentType: typeof record.subagent_type === 'string' ? record.subagent_type : previous?.agentType,
      description: String(record.description ?? patch.description ?? previous?.description ?? '子 Agent 任务'),
      status,
      summary: typeof record.summary === 'string' ? record.summary : previous?.summary,
      lastToolName: typeof record.last_tool_name === 'string' ? record.last_tool_name : previous?.lastToolName,
      totalTokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : previous?.totalTokens,
      toolUses: typeof usage.tool_uses === 'number' ? usage.tool_uses : previous?.toolUses,
      durationMs: typeof usage.duration_ms === 'number' ? usage.duration_ms : previous?.durationMs,
      error: typeof patch.error === 'string' ? patch.error : status === 'failed' ? String(record.summary ?? 'Subagent failed') : previous?.error,
      startedAt: previous?.startedAt ?? now,
      completedAt: isTerminalSubagentStatus(status) ? now : undefined,
    }
    run.subagents.set(taskId, current)
    this.store.upsertSubagent(current)
    this.event(sessionId, 'subagent', `${current.agentType ?? '子 Agent'}：${current.description}`, current.status, current)
  }
}
