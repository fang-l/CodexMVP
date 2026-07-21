import { useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2, X } from 'lucide-react'
import type { LlmApiConfigInput, LlmApiConfigPublic, LlmAuthMode, LlmProvider } from '../shared/types'

interface Props {
  config: LlmApiConfigPublic
  onClose: () => void
  onSave: (input: LlmApiConfigInput) => Promise<void>
  onClear: () => Promise<void>
}

export function LlmSettingsDialog({ config, onClose, onSave, onClear }: Props) {
  const [provider, setProvider] = useState<LlmProvider>(config.provider)
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [model, setModel] = useState(config.model)
  const [authMode, setAuthMode] = useState<LlmAuthMode>(config.authMode)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave({ provider, baseUrl, model, authMode, apiKey })
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    setError('')
    try {
      await onClear()
      onClose()
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="llm-dialog" role="dialog" aria-modal="true" aria-labelledby="llm-settings-title">
        <div className="permission-heading">
          <span className="permission-icon llm-icon"><KeyRound size={20} /></span>
          <div>
            <span className="eyebrow">MODEL CONNECTION</span>
            <h2 id="llm-settings-title">LLM API 配置</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭 API 配置"><X size={18} /></button>
        </div>

        <div className="credential-security-note">
          <ShieldCheck size={16} />
          <span>API Key 由操作系统凭据服务加密，仅 Electron Main Process 可以解密；Renderer、会话 JSON 和 Git 都不会保存明文。</span>
        </div>

        <div className="llm-form-grid">
          <label className="field">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as LlmProvider)}>
              <option value="anthropic">Anthropic API</option>
              <option value="compatible">Anthropic 兼容网关 / 代理</option>
              <option value="environment">使用启动环境变量</option>
            </select>
          </label>
          <label className="field">
            <span>默认模型 <small>可被会话配置覆盖</small></span>
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="例如 claude-sonnet-5" disabled={provider === 'environment'} />
          </label>
        </div>

        <label className="field">
          <span>API Base URL <small>{provider === 'anthropic' ? '留空使用 api.anthropic.com' : '教程或网关提供的地址'}</small></span>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" disabled={provider === 'environment'} spellCheck={false} />
        </label>

        <div className="auth-mode-field">
          <span>认证 Header</span>
          <div className="auth-mode-options">
            <button className={authMode === 'api_key' ? 'active' : ''} onClick={() => setAuthMode('api_key')} disabled={provider === 'environment'}><strong>X-Api-Key</strong><small>ANTHROPIC_API_KEY</small></button>
            <button className={authMode === 'bearer' ? 'active' : ''} onClick={() => setAuthMode('bearer')} disabled={provider === 'environment'}><strong>Bearer Token</strong><small>ANTHROPIC_AUTH_TOKEN</small></button>
          </div>
        </div>

        <label className="field">
          <span>API Key / Token <small>{config.apiKeyConfigured ? `已配置 ${config.maskedApiKey}` : '尚未配置'}</small></span>
          <div className="secret-input">
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={config.apiKeyConfigured ? '留空保留当前凭据' : '粘贴凭据'} disabled={provider === 'environment'} autoComplete="off" spellCheck={false} />
            <button onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </label>

        {provider === 'compatible' && <p className="proxy-hint">兼容网关必须支持 Anthropic Messages API。若教程要求 Authorization Header，请选择 Bearer Token。</p>}
        {!config.encryptionAvailable && <p className="credential-error">当前系统凭据加密不可用，AgentLab 将拒绝保存新的 Key。</p>}
        {error && <p className="credential-error">{error}</p>}

        <div className="permission-actions">
          <button className="button ghost danger" onClick={clear} disabled={busy || (!config.apiKeyConfigured && config.source !== 'app')}><Trash2 size={14} />清除应用凭据</button>
          <div className="permission-allow-group">
            <button className="button secondary" onClick={onClose} disabled={busy}>取消</button>
            <button className="button primary" onClick={submit} disabled={busy || !config.encryptionAvailable}>{busy ? '保存中…' : '安全保存'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
