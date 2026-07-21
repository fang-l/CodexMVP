import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Bot,
  BrainCircuit,
  ChevronDown,
  Circle,
  Command,
  FileCode2,
  Folder,
  Gauge,
  KeyRound,
  Menu,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { Markdown } from './components/Markdown'
import { EventItem } from './components/EventItem'
import { PermissionDialog } from './components/PermissionDialog'
import { LlmSettingsDialog } from './components/LlmSettingsDialog'
import type {
  AgentConfig,
  AppDiagnostics,
  ChatMessage,
  EffortLevel,
  LabSession,
  LlmApiConfigInput,
  LlmApiConfigPublic,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  RuntimeEvent,
  SettingSource,
} from './shared/types'
import { DEFAULT_TOOLS } from './shared/types'

type InspectorTab = 'run' | 'events' | 'sdk'
type ConfigTab = 'runtime' | 'tools' | 'extensions' | 'prompt'

const createLocalMessage = (role: ChatMessage['role'], content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: Date.now(),
})

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle-row">
      <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

function JsonEditor({ label, value, onChange, rows = 9 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  const valid = useMemo(() => {
    if (!value.trim()) return true
    try { JSON.parse(value); return true } catch { return false }
  }, [value])
  return (
    <label className="field json-field">
      <span>{label}<em className={valid ? 'valid' : 'invalid'}>{valid ? '有效 JSON' : 'JSON 错误'}</em></span>
      <textarea className="mono-input" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
    </label>
  )
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const starters = [
    { icon: FileCode2, title: '理解项目', prompt: '请分析这个项目的架构、入口和核心数据流，并给我一份学习路线。' },
    { icon: Wrench, title: '完成任务', prompt: '请先检查当前工作区，然后选择一个小而有价值的改进，实施并验证它。' },
    { icon: ShieldCheck, title: '代码审查', prompt: '调用 reviewer 子 Agent 审查当前工作区，重点检查正确性、安全和可维护性。' },
    { icon: BrainCircuit, title: 'SDK 实验', prompt: '先列出你当前可用的工具，然后分别用一个只读工具演示 Agent Loop。' },
  ]
  return (
    <div className="empty-state">
      <div className="brand-orbit large"><Sparkles size={26} /></div>
      <p className="eyebrow">CLAUDE AGENT SDK WORKBENCH</p>
      <h1>把 Agent 的每一步<br />变成可观察的实验</h1>
      <p className="empty-lede">选择一个工作区，发送任务，然后在右侧实时观察工具、权限、Hook、成本与原始 SDK 事件。</p>
      <div className="starter-grid">
        {starters.map(({ icon: Icon, title, prompt }) => (
          <button key={title} onClick={() => onPrompt(prompt)}>
            <Icon size={17} /><strong>{title}</strong><span>{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function App() {
  const [sessions, setSessions] = useState<LabSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics>()
  const [events, setEvents] = useState<Record<string, RuntimeEvent[]>>({})
  const [streamingText, setStreamingText] = useState<Record<string, string>>({})
  const [permission, setPermission] = useState<PermissionRequest>()
  const [prompt, setPrompt] = useState('')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('run')
  const [configTab, setConfigTab] = useState<ConfigTab>('runtime')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [suggestion, setSuggestion] = useState('')
  const [loading, setLoading] = useState(true)
  const [llmConfig, setLlmConfig] = useState<LlmApiConfigPublic>()
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const activeEvents = activeSessionId ? events[activeSessionId] ?? [] : []
  const activeStream = activeSessionId ? streamingText[activeSessionId] ?? '' : ''

  useEffect(() => {
    let disposed = false
    void window.agentLab.load().then((snapshot) => {
      if (disposed) return
      setSessions(snapshot.sessions)
      setActiveSessionId(snapshot.activeSessionId ?? snapshot.sessions[0]?.id)
      setDiagnostics(snapshot.diagnostics)
      setLlmConfig(snapshot.llmConfig)
      setLoading(false)
    })

    const stopEvents = window.agentLab.onEvent((event) => {
      setEvents((current) => ({ ...current, [event.sessionId]: [...(current[event.sessionId] ?? []), event].slice(-1000) }))
      if (event.kind === 'assistant_delta' && event.text) {
        setStreamingText((current) => ({ ...current, [event.sessionId]: (current[event.sessionId] ?? '') + event.text }))
      }
      if (event.kind === 'assistant' && event.text) {
        setStreamingText((current) => ({ ...current, [event.sessionId]: '' }))
        setSessions((current) => current.map((session) => {
          if (session.id !== event.sessionId) return session
          const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {}
          const messageId = typeof data.messageId === 'string' ? data.messageId : event.id
          if (session.messages.some((message) => message.id === messageId)) return session
          return { ...session, messages: [...session.messages, { id: messageId, role: 'assistant', content: event.text!, createdAt: event.timestamp }] }
        }))
      }
      if (event.kind === 'prompt_suggestion' && event.text) setSuggestion(event.text)
      if (event.kind === 'result') {
        setSessions((current) => current.map((session) => session.id === event.sessionId
          ? { ...session, status: 'idle', lastResult: event.data as LabSession['lastResult'] }
          : session))
      }
      if (event.kind === 'status') {
        const nextStatus = event.label.includes('运行') ? 'running' : 'idle'
        setSessions((current) => current.map((session) => session.id === event.sessionId ? { ...session, status: nextStatus } : session))
      }
      if (event.kind === 'error') {
        setSessions((current) => current.map((session) => session.id === event.sessionId
          ? { ...session, status: 'error', messages: [...session.messages, createLocalMessage('error', event.text || event.label)] }
          : session))
      }
    })
    const stopPermissions = window.agentLab.onPermission((request) => {
      setPermission(request)
      setActiveSessionId(request.sessionId)
      setSessions((current) => current.map((session) => session.id === request.sessionId ? { ...session, status: 'waiting_permission' } : session))
    })
    return () => { disposed = true; stopEvents(); stopPermissions() }
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [activeSession?.messages.length, activeStream, activeEvents.length])

  const createSession = async () => {
    const session = await window.agentLab.createSession(activeSession ? { cwd: activeSession.config.cwd } : undefined)
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
    setPrompt('')
  }

  const patchConfig = useCallback((patch: Partial<AgentConfig>) => {
    if (!activeSessionId) return
    let nextConfig: AgentConfig | undefined
    setSessions((current) => current.map((session) => {
      if (session.id !== activeSessionId) return session
      nextConfig = { ...session.config, ...patch }
      return { ...session, config: nextConfig }
    }))
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      if (nextConfig) void window.agentLab.updateSession(activeSessionId, { config: nextConfig })
    }, 350)
  }, [activeSessionId])

  const chooseDirectory = async () => {
    const directory = await window.agentLab.chooseDirectory()
    if (directory) patchConfig({ cwd: directory })
  }

  const send = async (override?: string) => {
    if (!activeSession || activeSession.status === 'running' || activeSession.status === 'waiting_permission') return
    const text = (override ?? prompt).trim()
    if (!text) return
    setSuggestion('')
    setPrompt('')
    setStreamingText((current) => ({ ...current, [activeSession.id]: '' }))
    setSessions((current) => current.map((session) => session.id === activeSession.id
      ? { ...session, status: 'running', messages: [...session.messages, createLocalMessage('user', text)], title: session.title === '新实验' ? text.slice(0, 38) : session.title }
      : session))
    await window.agentLab.sendMessage(activeSession.id, text)
  }

  const resolvePermission = async (decision: PermissionDecision) => {
    if (!permission) return
    const sessionId = permission.sessionId
    await window.agentLab.resolvePermission(permission.id, decision)
    setPermission(undefined)
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, status: 'running' } : session))
  }

  const deleteSession = async (sessionId: string) => {
    if (!window.confirm('删除这个 AgentLab 实验记录？Claude SDK 自己保存的 JSONL 会话不会被删除。')) return
    await window.agentLab.deleteSession(sessionId)
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId)
      if (activeSessionId === sessionId) setActiveSessionId(next[0]?.id)
      return next
    })
  }

  const saveLlmConfig = async (input: LlmApiConfigInput) => {
    const saved = await window.agentLab.saveLlmConfig(input)
    setLlmConfig(saved)
    setDiagnostics((current) => current ? { ...current, apiKeyConfigured: saved.apiKeyConfigured } : current)
  }

  const clearLlmConfig = async () => {
    const cleared = await window.agentLab.clearLlmConfig()
    setLlmConfig(cleared)
    setDiagnostics((current) => current ? { ...current, apiKeyConfigured: cleared.apiKeyConfigured } : current)
  }

  if (loading || !activeSession) return <div className="loading-screen"><div className="brand-orbit"><Sparkles size={20} /></div><span>正在启动 AgentLab…</span></div>

  const config = activeSession.config
  const isRunning = activeSession.status === 'running' || activeSession.status === 'waiting_permission'

  return (
    <main className={clsx('app-shell', !sidebarOpen && 'sidebar-collapsed', !inspectorOpen && 'inspector-collapsed')}>
      <aside className="sidebar">
        <div className="drag-region" />
        <div className="brand-row">
          <div className="brand-orbit"><Sparkles size={17} /></div>
          <div><strong>AgentLab</strong><small>SDK Workbench</small></div>
          <button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)}><X size={17} /></button>
        </div>
        <button className="new-session" onClick={createSession}><MessageSquarePlus size={16} /> 新建实验 <kbd>⌘N</kbd></button>
        <div className="sidebar-section-label">最近会话 <span>{sessions.length}</span></div>
        <nav className="session-list">
          {sessions.map((session) => (
            <button key={session.id} className={clsx('session-card', session.id === activeSessionId && 'active')} onClick={() => setActiveSessionId(session.id)}>
              <span className={clsx('status-dot', session.status)} />
              <span className="session-copy"><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span>
              <span className="delete-session" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void deleteSession(session.id) }}><Trash2 size={14} /></span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className={clsx('auth-state', diagnostics?.apiKeyConfigured && 'ready')} onClick={() => setLlmSettingsOpen(true)}><Circle size={9} fill="currentColor" /><span>{diagnostics?.apiKeyConfigured ? `API 已配置 · ${llmConfig?.source === 'environment' ? '环境' : '加密存储'}` : '配置 LLM API'}</span></button>
          <button onClick={() => setInspectorTab('sdk')}><Activity size={15} /> SDK {diagnostics?.sdkVersion}</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="drag-region top-drag" />
          {!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>}
          <div className="session-heading"><h2>{activeSession.title}</h2><span className={clsx('run-state', activeSession.status)}>{activeSession.status === 'waiting_permission' ? '等待授权' : activeSession.status === 'running' ? '运行中' : activeSession.status === 'error' ? '错误' : '就绪'}</span></div>
          <button className="cwd-picker" onClick={chooseDirectory} title={config.cwd}><Folder size={15} /><span>{config.cwd || '选择工作区'}</span><ChevronDown size={13} /></button>
          <div className="top-actions">
            <span className="model-chip"><Bot size={14} />{config.model || 'SDK 默认模型'}</span>
            <button className="icon-button" onClick={() => setInspectorOpen((value) => !value)}>{inspectorOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</button>
          </div>
        </header>

        <div className="transcript" ref={transcriptRef}>
          {activeSession.messages.length === 0 && !activeStream ? <EmptyState onPrompt={(value) => { setPrompt(value); void send(value) }} /> : (
            <div className="message-stack">
              {activeSession.messages.map((message) => (
                <article key={message.id} className={clsx('message', message.role)}>
                  <div className="message-avatar">{message.role === 'user' ? '你' : message.role === 'assistant' ? <Sparkles size={16} /> : <TerminalSquare size={16} />}</div>
                  <div className="message-body">
                    <div className="message-meta"><strong>{message.role === 'user' ? '你' : message.role === 'assistant' ? 'Claude Agent' : message.role === 'error' ? '错误' : '系统'}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
                    {message.role === 'assistant' ? <Markdown>{message.content}</Markdown> : <p>{message.content}</p>}
                  </div>
                </article>
              ))}
              {isRunning && (
                <article className="message assistant streaming">
                  <div className="message-avatar"><Sparkles size={16} /></div>
                  <div className="message-body">
                    <div className="message-meta"><strong>Claude Agent</strong><span className="live-label">LIVE</span></div>
                    {activeStream ? <Markdown>{activeStream}</Markdown> : <div className="thinking-line"><span /><span /><span /> {activeSession.status === 'waiting_permission' ? '等待你的授权…' : '正在思考并调用工具…'}</div>}
                  </div>
                </article>
              )}
              {activeEvents.filter((event) => ['tool_use', 'tool_result', 'permission', 'hook'].includes(event.kind)).slice(-4).map((event) => <EventItem key={event.id} event={event} compact />)}
            </div>
          )}
        </div>

        <footer className="composer-wrap">
          {suggestion && <button className="suggestion" onClick={() => setPrompt(suggestion)}><Sparkles size={13} /><span>{suggestion}</span><X size={13} onClick={(event) => { event.stopPropagation(); setSuggestion('') }} /></button>}
          <div className={clsx('composer', isRunning && 'running')}>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={isRunning ? 'Agent 正在工作…' : '给 Agent 一个任务，或输入 / 查看可用命令'} disabled={isRunning} rows={1} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} />
            <div className="composer-toolbar">
              <div className="composer-context"><span><Command size={13} /> {config.permissionMode}</span><span><Gauge size={13} /> {config.effort}</span><span><Wrench size={13} /> {config.tools.length} tools</span></div>
              {isRunning ? <button className="send-button stop" onClick={() => window.agentLab.interrupt(activeSession.id)}><Square size={14} fill="currentColor" /></button> : <button className="send-button" disabled={!prompt.trim()} onClick={() => void send()}><Send size={15} /></button>}
            </div>
          </div>
          <p className="composer-note">Agent 可能修改文件或执行命令。请检查权限请求与变更结果。</p>
        </footer>
      </section>

      <aside className="inspector">
        <div className="inspector-tabs">
          <button className={inspectorTab === 'run' ? 'active' : ''} onClick={() => setInspectorTab('run')}><Settings2 size={14} />运行配置</button>
          <button className={inspectorTab === 'events' ? 'active' : ''} onClick={() => setInspectorTab('events')}><Activity size={14} />事件 <span>{activeEvents.length}</span></button>
          <button className={inspectorTab === 'sdk' ? 'active' : ''} onClick={() => setInspectorTab('sdk')}><BrainCircuit size={14} />SDK</button>
        </div>

        {inspectorTab === 'run' && (
          <div className="inspector-scroll">
            <div className="config-subtabs">{(['runtime', 'tools', 'extensions', 'prompt'] as ConfigTab[]).map((tab) => <button key={tab} className={configTab === tab ? 'active' : ''} onClick={() => setConfigTab(tab)}>{({ runtime: '运行', tools: '工具', extensions: '扩展', prompt: '提示词' })[tab]}</button>)}</div>
            {configTab === 'runtime' && <RuntimeConfig config={config} patch={patchConfig} chooseDirectory={chooseDirectory} />}
            {configTab === 'tools' && <ToolsConfig config={config} patch={patchConfig} />}
            {configTab === 'extensions' && <ExtensionsConfig config={config} patch={patchConfig} />}
            {configTab === 'prompt' && <PromptConfig config={config} patch={patchConfig} />}
          </div>
        )}
        {inspectorTab === 'events' && <div className="inspector-scroll event-log">{activeEvents.length ? [...activeEvents].reverse().map((event) => <EventItem key={event.id} event={event} />) : <div className="panel-empty"><Activity size={24} /><strong>还没有 SDK 事件</strong><span>发送一条消息后，流式事件会显示在这里。</span></div>}</div>}
        {inspectorTab === 'sdk' && <SdkPanel diagnostics={diagnostics} session={activeSession} eventCount={activeEvents.length} onOpenLlmSettings={() => setLlmSettingsOpen(true)} />}
      </aside>

      {permission && <PermissionDialog request={permission} onDecision={(decision) => void resolvePermission(decision)} />}
      {llmSettingsOpen && llmConfig && <LlmSettingsDialog config={llmConfig} onClose={() => setLlmSettingsOpen(false)} onSave={saveLlmConfig} onClear={clearLlmConfig} />}
    </main>
  )
}

function RuntimeConfig({ config, patch, chooseDirectory }: { config: AgentConfig; patch: (value: Partial<AgentConfig>) => void; chooseDirectory: () => void }) {
  return <div className="config-panel">
    <section><h3>工作区与模型</h3><label className="field"><span>工作目录</span><button className="path-field" onClick={chooseDirectory}><Folder size={14} /><span>{config.cwd}</span></button></label><label className="field"><span>模型 <small>留空使用 SDK 默认</small></span><input value={config.model} onChange={(event) => patch({ model: event.target.value })} placeholder="claude-sonnet-5" /></label><label className="field"><span>Fallback 模型</span><input value={config.fallbackModel} onChange={(event) => patch({ fallbackModel: event.target.value })} placeholder="可选" /></label></section>
    <section><h3>执行策略</h3><label className="field"><span>权限模式</span><select value={config.permissionMode} onChange={(event) => patch({ permissionMode: event.target.value as PermissionMode })}>{['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', 'bypassPermissions'].map((value) => <option key={value}>{value}</option>)}</select></label>{config.permissionMode === 'bypassPermissions' && <div className="warning-box">此模式会跳过全部权限检查，仅用于你完全信任的工作区。</div>}<label className="field"><span>Effort</span><div className="segmented">{(['low', 'medium', 'high', 'xhigh', 'max'] as EffortLevel[]).map((level) => <button key={level} className={config.effort === level ? 'active' : ''} onClick={() => patch({ effort: level })}>{level}</button>)}</div></label><label className="field"><span>Thinking</span><select value={config.thinking.mode} onChange={(event) => patch({ thinking: { ...config.thinking, mode: event.target.value as AgentConfig['thinking']['mode'] } })}><option value="adaptive">adaptive</option><option value="enabled">fixed budget</option><option value="disabled">disabled</option></select></label>{config.thinking.mode === 'enabled' && <label className="field"><span>Thinking tokens</span><input type="number" min="1024" step="1024" value={config.thinking.budgetTokens} onChange={(event) => patch({ thinking: { ...config.thinking, budgetTokens: Number(event.target.value) } })} /></label>}</section>
    <section><h3>边界</h3><div className="field-grid"><label className="field"><span>最大 Turns</span><input type="number" min="1" value={config.maxTurns} onChange={(event) => patch({ maxTurns: Number(event.target.value) })} /></label><label className="field"><span>预算（USD）</span><input type="number" min="0" step="0.5" value={config.maxBudgetUsd} onChange={(event) => patch({ maxBudgetUsd: Number(event.target.value) })} /></label></div><Toggle label="Sandbox" hint="隔离 Bash 与文件访问" checked={config.sandboxEnabled} onChange={(value) => patch({ sandboxEnabled: value })} /><Toggle label="文件 Checkpoint" hint="支持 SDK rewindFiles" checked={config.enableFileCheckpointing} onChange={(value) => patch({ enableFileCheckpointing: value })} /></section>
    <section><h3>可观察性</h3><Toggle label="流式消息" checked={config.includePartialMessages} onChange={(value) => patch({ includePartialMessages: value })} /><Toggle label="Hook 事件" checked={config.includeHookEvents} onChange={(value) => patch({ includeHookEvents: value })} /><Toggle label="转发 Subagent 文本" checked={config.forwardSubagentText} onChange={(value) => patch({ forwardSubagentText: value })} /><Toggle label="下一步提示建议" checked={config.promptSuggestions} onChange={(value) => patch({ promptSuggestions: value })} /></section>
  </div>
}

function ToolsConfig({ config, patch }: { config: AgentConfig; patch: (value: Partial<AgentConfig>) => void }) {
  const toggle = (key: 'tools' | 'allowedTools' | 'disallowedTools', tool: string) => patch({ [key]: config[key].includes(tool) ? config[key].filter((item) => item !== tool) : [...config[key], tool] })
  return <div className="config-panel"><section><h3>内置工具集</h3><p className="section-help">决定哪些工具会出现在模型上下文。Auto-allow 只跳过提示，不是工具白名单。</p><div className="tool-matrix"><div className="matrix-head"><span>工具</span><span>启用</span><span>自动允许</span><span>禁止</span></div>{DEFAULT_TOOLS.map((tool) => <div className="matrix-row" key={tool}><strong>{tool}</strong><input type="checkbox" checked={config.tools.includes(tool)} onChange={() => toggle('tools', tool)} /><input type="checkbox" checked={config.allowedTools.includes(tool)} onChange={() => toggle('allowedTools', tool)} /><input type="checkbox" checked={config.disallowedTools.includes(tool)} onChange={() => toggle('disallowedTools', tool)} /></div>)}</div></section><section><h3>额外目录</h3><p className="section-help">每行一个绝对路径，作为工作目录之外的访问范围。</p><textarea className="mono-input" rows={5} value={config.additionalDirectories.join('\n')} onChange={(event) => patch({ additionalDirectories: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></section></div>
}

function ExtensionsConfig({ config, patch }: { config: AgentConfig; patch: (value: Partial<AgentConfig>) => void }) {
  return <div className="config-panel"><section><h3>MCP Servers</h3><JsonEditor label="Record<string, McpServerConfig>" value={config.mcpServersJson} onChange={(value) => patch({ mcpServersJson: value })} /><Toggle label="严格 MCP 配置" checked={config.strictMcpConfig} onChange={(value) => patch({ strictMcpConfig: value })} /></section><section><h3>Subagents</h3><JsonEditor label="Record<string, AgentDefinition>" value={config.agentsJson} onChange={(value) => patch({ agentsJson: value })} rows={14} /></section><section><h3>本地 Plugins</h3><JsonEditor label="SdkPluginConfig[]" value={config.pluginsJson} onChange={(value) => patch({ pluginsJson: value })} rows={5} /></section></div>
}

function PromptConfig({ config, patch }: { config: AgentConfig; patch: (value: Partial<AgentConfig>) => void }) {
  const toggleSource = (source: SettingSource) => patch({ settingSources: config.settingSources.includes(source) ? config.settingSources.filter((item) => item !== source) : [...config.settingSources, source] })
  return <div className="config-panel"><section><h3>System Prompt</h3><Toggle label="使用 claude_code preset" hint="保留 SDK 的完整编码 Agent 行为" checked={config.useClaudeCodePreset} onChange={(value) => patch({ useClaudeCodePreset: value })} /><label className="field"><span>{config.useClaudeCodePreset ? '追加指令' : '完整 System Prompt'}</span><textarea rows={10} value={config.systemPrompt} onChange={(event) => patch({ systemPrompt: event.target.value })} /></label></section><section><h3>文件设置来源</h3><div className="source-options">{(['user', 'project', 'local'] as SettingSource[]).map((source) => <label key={source}><input type="checkbox" checked={config.settingSources.includes(source)} onChange={() => toggleSource(source)} /><span><strong>{source}</strong><small>{source === 'user' ? '~/.claude/settings.json' : source === 'project' ? '.claude/settings.json + CLAUDE.md' : '.claude/settings.local.json'}</small></span></label>)}</div></section><section><h3>结构化输出</h3><p className="section-help">可选 JSON Schema。留空时返回普通文本。</p><JsonEditor label="Output JSON Schema" value={config.outputSchemaJson} onChange={(value) => patch({ outputSchemaJson: value })} rows={9} /></section></div>
}

function SdkPanel({ diagnostics, session, eventCount, onOpenLlmSettings }: { diagnostics?: AppDiagnostics; session: LabSession; eventCount: number; onOpenLlmSettings: () => void }) {
  const rows = [['Agent SDK', diagnostics?.sdkVersion], ['Claude Code Session', session.sdkSessionId || '尚未初始化'], ['Electron', diagnostics?.electronVersion], ['Node.js', diagnostics?.nodeVersion], ['平台', `${diagnostics?.platform} / ${diagnostics?.arch}`], ['本次事件', String(eventCount)]]
  return <div className="inspector-scroll sdk-panel"><div className="sdk-hero"><div className="brand-orbit"><BrainCircuit size={19} /></div><span className="eyebrow">RUNTIME DIAGNOSTICS</span><h3>真实 SDK，完整事件流</h3><p>AgentLab 在 Electron Main Process 中调用 Claude Agent SDK，Renderer 只通过受限 IPC 观察状态与处理授权。</p></div><div className="diagnostic-list">{rows.map(([label, value]) => <div key={label}><span>{label}</span><code title={value}>{value}</code></div>)}</div><div className="architecture-card"><strong>安全边界</strong><div><span>Renderer</span><i>IPC</i><span>Main</span><i>SDK</i><span>Claude</span></div><p>API Key 不进入前端；文件与命令工具由 SDK 子进程执行；敏感动作通过 canUseTool 回传授权。</p></div><button className="button primary full" onClick={onOpenLlmSettings}><KeyRound size={14} />配置 LLM API</button><button className="button secondary full sdk-secondary-button" onClick={() => diagnostics && window.agentLab.revealPath(diagnostics.userDataPath)}><Folder size={14} />打开 AgentLab 数据目录</button></div>
}
