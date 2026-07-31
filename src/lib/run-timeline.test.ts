import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RuntimeEvent, RuntimeEventKind } from '../shared/types'
import { buildRunTimeline } from './run-timeline'

let timestamp = 1
const event = (kind: RuntimeEventKind, label: string, overrides: Partial<RuntimeEvent> = {}): RuntimeEvent => ({
  id: `event-${timestamp}`,
  sessionId: 'session-1',
  timestamp: timestamp++,
  kind,
  label,
  ...overrides,
})

describe('buildRunTimeline', () => {
  it('keeps chronological steps while grouping text deltas into one live answer', () => {
    timestamp = 1
    const events = [
      event('status', 'Agent 正在运行', { text: 'running' }),
      event('system_context', '系统上下文', { data: { task: '检查项目', model: 'm', project: 'p', tools: ['Read'], permissions: { mode: 'default' } } }),
      event('thinking', 'Thinking', { text: '先读取' }),
      event('thinking', 'Thinking 完成', { text: '先读取文件' }),
      event('hook', 'PreToolUse', { data: { tool_name: 'Read', tool_input: { file_path: 'a.ts' } } }),
      event('tool_use', 'Read', { toolName: 'Read', toolUseId: 'tool-1', data: { file_path: 'a.ts' } }),
      event('tool_result', '工具结果', { toolUseId: 'tool-1', data: 'file body' }),
      event('hook', 'PostToolUse', { data: { tool_name: 'Read', tool_response: 'ok' } }),
      event('assistant_delta', '文本流', { text: '完成' }),
      event('assistant_delta', '文本流', { text: '检查' }),
      event('assistant', 'Claude Agent', { text: '完成检查' }),
      event('result', '运行完成', { data: { isError: false } }),
      event('status', 'Agent 已空闲', { text: 'idle' }),
    ]

    const [run] = buildRunTimeline(events)
    assert.deepEqual(run.steps.map((step) => step.kind), [
      'context', 'understanding', 'pre_tool', 'tool_call', 'tool_output', 'post_tool', 'answer', 'complete',
    ])
    const answer = run.steps.find((step) => step.kind === 'answer')!
    assert.equal(answer.output, '完成检查')
    assert.equal(answer.rawEvents.length, 3)
    assert.equal(run.rawEvents.length, events.length)
    assert.equal(run.status, 'complete')
  })

  it('starts a new run at each running event and makes permission and errors prominent', () => {
    timestamp = 100
    const runs = buildRunTimeline([
      event('status', 'Agent 正在运行', { text: 'running' }),
      event('permission', '等待授权：Bash', { toolName: 'Bash', toolUseId: 'tool-2', data: { command: 'pwd' } }),
      event('permission', '权限决定：Bash', { toolName: 'Bash', toolUseId: 'tool-2', text: '已拒绝' }),
      event('error', '运行失败', { text: 'permission denied' }),
      event('status', 'Agent 正在运行', { text: 'running' }),
      event('status', '任务已停止', { text: 'idle' }),
    ])

    assert.equal(runs.length, 2)
    assert.equal(runs[0].status, 'error')
    assert.equal(runs[0].steps[0].kind, 'permission')
    assert.equal(runs[0].steps[0].status, 'error')
    assert.equal(runs[0].steps[0].output, '已拒绝')
    assert.equal(runs[1].status, 'stopped')
  })

  it('keeps an explicit understanding step when the SDK sends no thinking events', () => {
    timestamp = 200
    const [run] = buildRunTimeline([
      event('status', 'Agent 正在运行', { text: 'running' }),
      event('system_context', '系统上下文', { data: { task: '直接回答', model: 'm', project: 'p', tools: [], permissions: { mode: 'default' } } }),
      event('assistant', 'Claude Agent', { text: '回答' }),
      event('result', '运行完成', { data: { isError: false } }),
    ])

    const understanding = run.steps.find((step) => step.kind === 'understanding')
    assert.ok(understanding)
    assert.equal(understanding.status, 'complete')
    assert.equal(understanding.output, '任务已交给 Agent，SDK 未返回独立分析事件')
  })
})
