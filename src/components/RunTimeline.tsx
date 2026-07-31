import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Code2,
  CornerDownRight,
  FileOutput,
  Flag,
  KeyRound,
  MessageSquareText,
  Play,
  Settings2,
  ShieldAlert,
  Wrench,
} from 'lucide-react'
import clsx from 'clsx'
import { buildRunTimeline, type TimelineStep, type TimelineStepKind } from '../lib/run-timeline'
import type { RuntimeEvent } from '../shared/types'

const stepIcons: Record<TimelineStepKind, typeof Check> = {
  context: Settings2,
  understanding: Brain,
  pre_tool: Play,
  tool_call: Wrench,
  tool_output: FileOutput,
  post_tool: Flag,
  answer: MessageSquareText,
  permission: KeyRound,
  system: Code2,
  complete: CircleCheck,
  error: AlertTriangle,
}

const valueText = (value: unknown) => {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

const previewText = (value: unknown) => valueText(value).replace(/\s+/g, ' ').slice(0, 72)

function StepCard({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const [open, setOpen] = useState(step.kind === 'context' || step.kind === 'permission' || step.kind === 'error')
  const Icon = stepIcons[step.kind]
  return (
    <article className={clsx('timeline-step', `timeline-${step.kind}`, `timeline-status-${step.status}`)}>
      <div className="timeline-rail" aria-hidden="true">
        <span><Icon size={13} /></span>
        {!isLast && <i />}
      </div>
      <div className="timeline-card">
        <button className="timeline-step-summary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="timeline-step-title">
            <strong>{step.title}</strong>
            <small>{step.interaction}</small>
            <span className="timeline-io-preview"><b>输入</b>{previewText(step.input)}<b>输出</b>{previewText(step.output)}</span>
          </span>
          <time>{formatTime(step.timestamp)}</time>
          {step.status === 'active' && <span className="timeline-live">LIVE</span>}
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {open && (
          <div className="timeline-step-body">
            <div className="timeline-flow-row">
              <span><CornerDownRight size={12} /> 输入</span>
              <pre>{valueText(step.input)}</pre>
            </div>
            <div className="timeline-flow-row" aria-live={step.kind === 'answer' ? 'polite' : undefined}>
              <span><FileOutput size={12} /> 输出</span>
              <pre>{valueText(step.output)}</pre>
            </div>
            <details className="timeline-audit">
              <summary>{step.rawEvents.length} 条原始事件</summary>
              <pre>{valueText(step.rawEvents)}</pre>
            </details>
          </div>
        )}
      </div>
    </article>
  )
}

export function RunTimeline({ events }: { events: RuntimeEvent[] }) {
  const runs = useMemo(() => buildRunTimeline(events), [events])

  return (
    <div className="timeline-log">
      {[...runs].reverse().map((run, reverseIndex) => {
        const runNumber = runs.length - reverseIndex
        const statusLabel = run.status === 'running' ? '运行中' : run.status === 'complete' ? '已完成' : run.status === 'stopped' ? '已停止' : '错误'
        return (
          <section className={clsx('timeline-run', `run-${run.status}`)} key={run.id}>
            <header className="timeline-run-header">
              <span className="timeline-run-index">{runNumber}</span>
              <div><strong>第 {runNumber} 轮运行</strong><small>{formatTime(run.startedAt)} · {run.steps.length} 个步骤 · {run.rawEvents.length} 条事件</small></div>
              <span className="timeline-run-status">{statusLabel}</span>
            </header>
            <div className="timeline-steps">
              {run.steps.map((step, index) => <StepCard key={step.id} step={step} isLast={index === run.steps.length - 1} />)}
            </div>
          </section>
        )
      })}
      {!runs.length && (
        <div className="panel-empty"><ShieldAlert size={24} /><strong>还没有执行步骤</strong><span>发送任务后，这里会按实际顺序展示完整链路。</span></div>
      )}
    </div>
  )
}
