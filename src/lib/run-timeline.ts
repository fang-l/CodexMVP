import type { RuntimeEvent } from '../shared/types'

export type TimelineStepKind =
  | 'context'
  | 'understanding'
  | 'pre_tool'
  | 'tool_call'
  | 'tool_output'
  | 'post_tool'
  | 'answer'
  | 'permission'
  | 'system'
  | 'complete'
  | 'error'

export type TimelineStepStatus = 'active' | 'complete' | 'warning' | 'error'

export interface TimelineStep {
  id: string
  kind: TimelineStepKind
  title: string
  interaction: string
  timestamp: number
  status: TimelineStepStatus
  input?: unknown
  output?: unknown
  rawEvents: RuntimeEvent[]
}

export interface TimelineRun {
  id: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'complete' | 'stopped' | 'error'
  steps: TimelineStep[]
  rawEvents: RuntimeEvent[]
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

const startsRun = (event: RuntimeEvent) =>
  event.kind === 'system_context' || (event.kind === 'status' && (event.text === 'running' || event.label.includes('正在运行')))

const newRun = (event: RuntimeEvent, index: number): TimelineRun => ({
  id: `run-${index}-${event.id}`,
  startedAt: event.timestamp,
  status: 'running',
  steps: [],
  rawEvents: [],
})

const addStep = (run: TimelineRun, event: RuntimeEvent, step: Omit<TimelineStep, 'id' | 'timestamp' | 'rawEvents'>) => {
  run.steps.push({ ...step, id: event.id, timestamp: event.timestamp, rawEvents: [event] })
}

const appendText = (current: unknown, addition: string) => `${typeof current === 'string' ? current : ''}${addition}`

function foldEvent(run: TimelineRun, event: RuntimeEvent) {
  if (event.kind === 'status' && (event.text === 'running' || event.label.includes('正在运行'))) return

  if (event.kind === 'system_context') {
    const context = asRecord(event.data)
    addStep(run, event, {
      kind: 'context',
      title: '系统上下文',
      interaction: '为本轮运行建立经过安全筛选的上下文',
      status: 'complete',
      input: context.task,
      output: {
        模型: context.model,
        项目: context.project,
        工具能力: context.tools,
        权限: context.permissions,
      },
    })
    run.steps.push({
      id: `${event.id}-understanding`,
      kind: 'understanding',
      title: '理解任务',
      interaction: 'Agent 分析任务并规划下一步',
      timestamp: event.timestamp,
      status: 'active',
      input: context.task,
      output: '等待 Agent 返回分析事件',
      rawEvents: [],
    })
    return
  }

  if (event.kind === 'thinking') {
    const existing = run.steps.find((step) => step.kind === 'understanding')
    if (existing) {
      existing.rawEvents.push(event)
      if (existing.rawEvents.length === 1 && event.text) existing.output = event.text
      else if (event.label.includes('完成') && event.text) existing.output = event.text
      else if (event.text && !(typeof existing.output === 'string' && existing.output.endsWith(event.text))) {
        existing.output = appendText(existing.output, event.text)
      }
      existing.status = event.label.includes('完成') ? 'complete' : 'active'
      return
    }
    addStep(run, event, {
      kind: 'understanding',
      title: '理解任务',
      interaction: 'Agent 分析任务并规划下一步',
      status: event.label.includes('完成') ? 'complete' : 'active',
      input: run.steps.find((step) => step.kind === 'context')?.input,
      output: event.text,
    })
    return
  }

  if (event.kind === 'hook') {
    const payload = asRecord(event.data)
    const hookName = event.label
    const isPre = hookName === 'PreToolUse'
    const isPost = hookName === 'PostToolUse' || hookName === 'PostToolUseFailure'
    addStep(run, event, {
      kind: isPre ? 'pre_tool' : isPost ? 'post_tool' : 'system',
      title: hookName,
      interaction: isPre
        ? `工具执行前检查${payload.tool_name ? ` · ${String(payload.tool_name)}` : ''}`
        : isPost
          ? `工具执行后检查${payload.tool_name ? ` · ${String(payload.tool_name)}` : ''}`
          : '执行 SDK Hook',
      status: hookName === 'PostToolUseFailure' ? 'error' : 'complete',
      input: payload.tool_input ?? payload,
      output: payload.tool_response ?? (hookName === 'PostToolUseFailure' ? payload.error : 'Hook 已完成，继续执行'),
    })
    return
  }

  if (event.kind === 'tool_use') {
    addStep(run, event, {
      kind: 'tool_call',
      title: `工具调用 · ${event.toolName || event.label}`,
      interaction: `Agent 请求执行 ${event.toolName || event.label}`,
      status: 'active',
      input: event.data,
      output: '等待工具返回',
    })
    return
  }

  if (event.kind === 'tool_result') {
    const call = [...run.steps].reverse().find((step) => step.kind === 'tool_call' && (
      !event.toolUseId || step.rawEvents.some((raw) => raw.toolUseId === event.toolUseId)
    ))
    if (call) call.status = 'complete'
    addStep(run, event, {
      kind: 'tool_output',
      title: `工具输出${call ? ` · ${call.rawEvents[0].toolName || call.rawEvents[0].label}` : ''}`,
      interaction: '工具返回执行结果',
      status: 'complete',
      input: event.toolUseId ? { toolUseId: event.toolUseId } : undefined,
      output: event.data ?? event.text,
    })
    return
  }

  if (event.kind === 'permission') {
    const isDecision = event.label.startsWith('权限决定')
    const pending = [...run.steps].reverse().find((step) => step.kind === 'permission' && step.status === 'warning' && (
      !event.toolUseId || step.rawEvents.some((raw) => raw.toolUseId === event.toolUseId)
    ))
    if (isDecision && pending) {
      pending.rawEvents.push(event)
      pending.output = event.text ?? event.data
      pending.status = event.text === '已拒绝' ? 'error' : 'complete'
      return
    }
    addStep(run, event, {
      kind: 'permission',
      title: event.label,
      interaction: isDecision ? '记录用户的权限决定' : '需要用户确认后才能继续',
      status: isDecision ? (event.text === '已拒绝' ? 'error' : 'complete') : 'warning',
      input: isDecision ? { tool: event.toolName } : event.data,
      output: isDecision ? event.text : '等待用户决定',
    })
    return
  }

  if (event.kind === 'assistant_delta' || event.kind === 'assistant') {
    const existing = run.steps.find((step) => step.kind === 'answer')
    if (existing) {
      existing.rawEvents.push(event)
      if (event.kind === 'assistant' && event.text) existing.output = event.text
      else if (event.text) existing.output = appendText(existing.output, event.text)
      existing.status = event.kind === 'assistant' ? 'complete' : 'active'
      return
    }
    addStep(run, event, {
      kind: 'answer',
      title: '文本流 / 生成回答',
      interaction: 'Agent 生成面向用户的回答',
      status: event.kind === 'assistant' ? 'complete' : 'active',
      output: event.text,
    })
    return
  }

  if (event.kind === 'result') {
    const summary = asRecord(event.data)
    const failed = Boolean(summary.isError) || event.label.includes('错误')
    addStep(run, event, {
      kind: failed ? 'error' : 'complete',
      title: event.label,
      interaction: failed ? 'SDK 返回错误结果' : 'SDK 完成本轮运行',
      status: failed ? 'error' : 'complete',
      output: event.data,
    })
    run.steps.forEach((step) => {
      if (step.status !== 'active') return
      step.status = 'complete'
      if (step.kind === 'understanding' && step.rawEvents.length === 0) {
        step.output = '任务已交给 Agent，SDK 未返回独立分析事件'
      }
    })
    run.status = failed ? 'error' : 'complete'
    run.endedAt = event.timestamp
    return
  }

  if (event.kind === 'error') {
    run.steps.forEach((step) => {
      if (step.status === 'active') step.status = 'error'
      if (step.kind === 'understanding' && step.rawEvents.length === 0) step.output = '分析阶段因错误中止'
    })
    addStep(run, event, {
      kind: 'error',
      title: event.label,
      interaction: '运行遇到错误并停止',
      status: 'error',
      input: event.data,
      output: event.text,
    })
    run.status = 'error'
    run.endedAt = event.timestamp
    return
  }

  if (event.kind === 'status' && event.text === 'idle') {
    if (run.status === 'running') {
      const stopped = event.label.includes('停止')
      addStep(run, event, {
        kind: stopped ? 'error' : 'complete',
        title: event.label,
        interaction: stopped ? '用户终止本轮运行' : 'Agent 返回空闲状态',
        status: stopped ? 'warning' : 'complete',
        output: stopped ? '本轮已停止' : '本轮已结束',
      })
      run.status = stopped ? 'stopped' : 'complete'
      run.steps.forEach((step) => {
        if (step.status === 'active') step.status = stopped ? 'warning' : 'complete'
        if (step.kind === 'understanding' && step.rawEvents.length === 0) {
          step.output = stopped ? '分析阶段被用户停止' : 'SDK 未返回独立分析事件'
        }
      })
    }
    run.endedAt = event.timestamp
    return
  }

  if (event.kind === 'system' && ['thinking_tokens', '运行路由'].includes(event.label)) return

  addStep(run, event, {
    kind: event.kind === 'prompt_suggestion' ? 'complete' : 'system',
    title: event.label,
    interaction: event.kind === 'prompt_suggestion' ? '生成下一步建议' : 'SDK 运行事件',
    status: event.label === 'api_retry' ? 'warning' : 'complete',
    input: event.data,
    output: event.text,
  })
}

export function buildRunTimeline(events: RuntimeEvent[]): TimelineRun[] {
  const ordered = [...events].sort((left, right) => left.timestamp - right.timestamp)
  const runs: TimelineRun[] = []
  let current: TimelineRun | undefined

  for (const event of ordered) {
    if (startsRun(event) && (!current || current.status !== 'running' || (
      event.kind === 'status' && current.rawEvents.some((item) => item.kind === 'status' && item.text === 'running')
    ))) {
      current = newRun(event, runs.length)
      runs.push(current)
    }
    if (!current) {
      current = newRun(event, runs.length)
      runs.push(current)
    }
    current.rawEvents.push(event)
    foldEvent(current, event)
  }

  return runs
}
