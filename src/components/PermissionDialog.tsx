import { ShieldAlert, X } from 'lucide-react'
import type { PermissionDecision, PermissionRequest } from '../shared/types'

interface Props {
  request: PermissionRequest
  onDecision: (decision: PermissionDecision) => void
}

export function PermissionDialog({ request, onDecision }: Props) {
  return (
    <div className="modal-backdrop">
      <section className="permission-dialog" role="dialog" aria-modal="true" aria-labelledby="permission-title">
        <div className="permission-heading">
          <span className="permission-icon"><ShieldAlert size={21} /></span>
          <div>
            <span className="eyebrow">需要你的确认</span>
            <h2 id="permission-title">{request.title || `${request.toolName} 请求执行操作`}</h2>
          </div>
          <button className="icon-button" onClick={() => onDecision('deny')} aria-label="拒绝并关闭"><X size={18} /></button>
        </div>
        {(request.description || request.decisionReason) && (
          <p className="permission-description">{request.description || request.decisionReason}</p>
        )}
        <div className="permission-meta">
          <span className="tool-badge">{request.displayName || request.toolName}</span>
          {request.blockedPath && <code>{request.blockedPath}</code>}
        </div>
        <pre className="permission-input">{JSON.stringify(request.input, null, 2)}</pre>
        <div className="permission-actions">
          <button className="button ghost danger" onClick={() => onDecision('deny')}>拒绝</button>
          <div className="permission-allow-group">
            {request.hasSuggestions && (
              <button className="button secondary" onClick={() => onDecision('allow_session')}>本会话始终允许</button>
            )}
            <button className="button primary" onClick={() => onDecision('allow_once')}>仅允许一次</button>
          </div>
        </div>
      </section>
    </div>
  )
}
