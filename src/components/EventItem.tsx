import { useState } from 'react'
import { ChevronDown, ChevronRight, CircleCheck, CircleX, Code2, Gauge, Shield, Sparkles, Wrench } from 'lucide-react'
import clsx from 'clsx'
import type { RuntimeEvent } from '../shared/types'

const icons = {
  system_context: Code2,
  assistant: Sparkles,
  assistant_delta: Sparkles,
  thinking: Gauge,
  tool_use: Wrench,
  tool_result: Code2,
  permission: Shield,
  result: CircleCheck,
  error: CircleX,
} as const

export function EventItem({ event, compact = false }: { event: RuntimeEvent; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const Icon = icons[event.kind as keyof typeof icons] ?? Code2
  const details = event.data ?? event.raw
  return (
    <article className={clsx('event-item', `event-${event.kind}`, compact && 'compact')}>
      <button className="event-summary" onClick={() => setOpen((value) => !value)} disabled={!details && !event.text}>
        <span className="event-icon"><Icon size={14} /></span>
        <span className="event-copy">
          <strong>{event.label}</strong>
          {!compact && event.text && <small>{event.text.slice(0, 110)}</small>}
        </span>
        <time>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
        {(details || event.text) && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
      </button>
      {open && (
        <pre className="event-detail">{details ? JSON.stringify(details, null, 2) : event.text}</pre>
      )}
    </article>
  )
}
