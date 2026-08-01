import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Bot,
  BrainCircuit,
  ChevronDown,
  Circle,
  Command,
  FileCode2,
  Folder,
  GitBranch,
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
  RefreshCw,
  TerminalSquare,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import clsx from 'clsx'
import { Markdown } from './components/Markdown'
import { EventItem } from './components/EventItem'
import { RunTimeline } from './components/RunTimeline'
import { PermissionDialog } from './components/PermissionDialog'
import { LlmSettingsDialog } from './components/LlmSettingsDialog'
import type {
  AgentConfig,
  AppDiagnostics,
  ChatMessage,
  EffortLevel,
  LabSession,
  Project,
  LlmApiConfigInput,
  LlmApiConfigPublic,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  RuntimeEvent,
  GitWorkspaceStatus,
  GitDiffView,
  VerificationCommand,
  VerificationRun,
  FileTreeEntry,
  SubagentRun,
  SandboxProfile,
  SettingSource,
} from './shared/types'
import { DEFAULT_TOOLS } from './shared/types'

type InspectorTab = 'run' | 'changes' | 'verify' | 'events' | 'sdk'
type ConfigTab = 'runtime' | 'tools' | 'extensions' | 'prompt'
type EventView = 'steps' | 'raw'

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
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>()
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics>()
  const [events, setEvents] = useState<Record<string, RuntimeEvent[]>>({})
  const [streamingText, setStreamingText] = useState<Record<string, string>>({})
  const [permission, setPermission] = useState<PermissionRequest>()
  const [prompt, setPrompt] = useState('')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('run')
  const [eventView, setEventView] = useState<EventView>('steps')
  const [configTab, setConfigTab] = useState<ConfigTab>('runtime')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [suggestion, setSuggestion] = useState('')
  const [loading, setLoading] = useState(true)
  const [llmConfig, setLlmConfig] = useState<LlmApiConfigPublic>()
  const [llmSettingsOpen, setLlmSettingsOpen] = useState(false)
  const [gitStatus, setGitStatus] = useState<GitWorkspaceStatus>()
  const [gitDiff, setGitDiff] = useState<GitDiffView>()
  const [files, setFiles] = useState<FileTreeEntry[]>([])
  const [verificationCommands, setVerificationCommands] = useState<VerificationCommand[]>([])
  const [verificationRuns, setVerificationRuns] = useState<VerificationRun[]>([])
  const [subagents, setSubagents] = useState<SubagentRun[]>([])
  const [workbenchError, setWorkbenchError] = useState('')
  const saveTimer = useRef<number | undefined>(undefined)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const activeEvents = activeSessionId ? events[activeSessionId] ?? [] : []
  const activeStream = activeSessionId ? streamingText[activeSessionId] ?? '' : ''

  const refreshWorkbench = useCallback(async (sessionId: string) => {
    try {
      const [status, commands, runs, tree, persistedEvents, persistedSubagents] = await Promise.all([
        window.agentLab.getGitStatus(sessionId),
        window.agentLab.discoverVerifications(sessionId),
        window.agentLab.listVerifications(sessionId),
        window.agentLab.listFiles(sessionId).catch(() => []),
        window.agentLab.listPersistedEvents(sessionId),
        window.agentLab.listSubagents(sessionId),
      ])
      setGitStatus(status); setVerificationCommands(commands); setVerificationRuns(runs); setFiles(tree); setSubagents(persistedSubagents)
      setEvents((current) => {
        const merged = [...persistedEvents, ...(current[sessionId] ?? [])]
        return { ...current, [sessionId]: [...new Map(merged.map((item) => [item.id, item])).values()].sort((a, b) => a.timestamp - b.timestamp).slice(-1000) }
      })
      if (status.available) setGitDiff(await window.agentLab.getGitDiff(sessionId, 'unstaged'))
      else setGitDiff(undefined)
      setWorkbenchError('')
    } catch (error) { setWorkbenchError(error instanceof Error ? error.message : String(error)) }
  }, [])

  useEffect(() => {
    let disposed = false
    void window.agentLab.load().then((snapshot) => {
      if (disposed) return
      setSessions(snapshot.sessions)
      setProjects(snapshot.projects)
      setActiveProjectId(snapshot.activeProjectId ?? snapshot.sessions[0]?.projectId)
      setExpandedProjects(new Set(snapshot.projects.map((project) => project.id)))
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
        void refreshWorkbench(event.sessionId)
      }
      if (event.kind === 'subagent') void window.agentLab.listSubagents(event.sessionId).then(setSubagents)
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
  }, [refreshWorkbench])

  useEffect(() => { if (activeSessionId) void refreshWorkbench(activeSessionId) }, [activeSessionId, activeSession?.config.cwd, refreshWorkbench])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [activeSession?.messages.length, activeStream, activeEvents.length])

  const createSession = async () => {
    const session = await window.agentLab.createSession(activeSession ? { cwd: activeSession.config.cwd } : undefined, activeProjectId ?? activeSession?.projectId)
    setSessions((current) => [session, ...current])
    setActiveProjectId(session.projectId)
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
    if (!directory || !activeSession) return
    const updated = await window.agentLab.updateSession(activeSession.id, { config: { ...activeSession.config, cwd: directory } })
    setSessions((current) => current.map((session) => session.id === updated.id ? updated : session))
    setProjects(await window.agentLab.listProjects())
    setActiveProjectId(updated.projectId)
    if (updated.projectId) setExpandedProjects((current) => new Set([...current, updated.projectId!]))
  }

  const openProject = async () => {
    const directory = await window.agentLab.chooseDirectory()
    if (!directory) return
    const project = await window.agentLab.createProject(directory)
    const session = await window.agentLab.createSession({ cwd: project.rootPath }, project.id)
    setProjects(await window.agentLab.listProjects())
    setSessions((current) => [session, ...current])
    setActiveProjectId(project.id)
    setExpandedProjects((current) => new Set([...current, project.id]))
    setActiveSessionId(session.id)
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

  const interrupt = async () => {
    if (!activeSession) return
    const sessionId = activeSession.id
    // Release the composer immediately. The main process will still ask the SDK
    // to stop, but that cleanup must not leave the user trapped in a run state.
    if (permission?.sessionId === sessionId) setPermission(undefined)
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, status: 'idle' } : session))
    try {
      await window.agentLab.interrupt(sessionId)
    } catch (error) {
      setSessions((current) => current.map((session) => session.id === sessionId
        ? { ...session, status: 'error', messages: [...session.messages, createLocalMessage('error', error instanceof Error ? error.message : String(error))] }
        : session))
    }
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
  const effectiveModel = config.model || llmConfig?.model || 'SDK 默认模型'
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
        <div className="sidebar-actions"><button className="new-session" onClick={createSession}><MessageSquarePlus size={16} /> 新建实验 <kbd>⌘N</kbd></button><button className="open-project" onClick={() => void openProject()}><Plus size={15} /> 打开项目</button></div>
        <div className="sidebar-section-label">项目 <span>{projects.length}</span></div>
        <nav className="project-list" aria-label="项目与会话">
          {projects.map((project) => {
            const projectSessions = sessions.filter((session) => session.projectId === project.id)
            const expanded = expandedProjects.has(project.id)
            return <section className={clsx('project-group', project.id === activeProjectId && 'active')} key={project.id}>
              <button className="project-card" onClick={() => { setActiveProjectId(project.id); setExpandedProjects((current) => { const next = new Set(current); if (next.has(project.id)) next.delete(project.id); else next.add(project.id); return next }) }} title={project.rootPath} aria-expanded={expanded}>
                <ChevronDown className={clsx(!expanded && 'collapsed')} size={14} /><Folder size={15}/><span><strong>{project.name}</strong><small>{projectSessions.length} 个会话 · {project.rootPath}</small></span>
              </button>
              {expanded && <div className="session-list">{projectSessions.length ? projectSessions.map((session) => (
                <button key={session.id} className={clsx('session-card', session.id === activeSessionId && 'active')} onClick={() => { setActiveSessionId(session.id); setActiveProjectId(project.id) }}>
                  <span className={clsx('status-dot', session.status)} />
                  <span className="session-copy"><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></span>
                  <span className="delete-session" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); void deleteSession(session.id) }}><Trash2 size={14} /></span>
                </button>
              )) : <p className="project-empty">此项目尚无会话</p>}</div>}
            </section>
          })}
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
            <span className="model-chip" title={effectiveModel}><Bot size={14} />{effectiveModel}</span>
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
              {isRunning ? <button className="send-button stop" onClick={() => void interrupt()} title="停止当前任务"><Square size={14} fill="currentColor" /></button> : <button className="send-button" disabled={!prompt.trim()} onClick={() => void send()}><Send size={15} /></button>}
            </div>
          </div>
          <p className="composer-note">Agent 可能修改文件或执行命令。请检查权限请求与变更结果。</p>
        </footer>
      </section>

      <aside className="inspector">
        <div className="inspector-tabs">
          <button className={inspectorTab === 'run' ? 'active' : ''} onClick={() => setInspectorTab('run')}><Settings2 size={14} />运行配置</button>
          <button className={inspectorTab === 'changes' ? 'active' : ''} onClick={() => setInspectorTab('changes')}><GitBranch size={14} />变更 <span>{gitStatus?.files.length ?? 0}</span></button>
          <button className={inspectorTab === 'verify' ? 'active' : ''} onClick={() => setInspectorTab('verify')}><CheckCircle2 size={14} />验证</button>
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
        {inspectorTab === 'changes' && <GitPanel sessionId={activeSession.id} status={gitStatus} diff={gitDiff} files={files} error={workbenchError} onRefresh={() => refreshWorkbench(activeSession.id)} onStatus={setGitStatus} onDiff={setGitDiff} />}
        {inspectorTab === 'verify' && <VerificationPanel sessionId={activeSession.id} commands={verificationCommands} runs={verificationRuns} subagents={subagents} onRuns={setVerificationRuns} onReview={() => send('请调用 reviewer 子 Agent 对当前工作区的未提交变更做只读审查。必须等待 reviewer 进入终态后再汇总；按 critical/high/medium/low 输出具体问题、文件和行号，不要修改文件。')} onUseResult={(run) => setPrompt(`请修复以下验证失败，并在完成后重新运行验证：\n\n命令：${run.command.executable} ${run.command.args.join(' ')}\n退出码：${run.exitCode}\n\n${run.output.slice(-12000)}`)} />}
        {inspectorTab === 'events' && (
          <div className="event-panel">
            <div className="event-view-switch" role="tablist" aria-label="事件展示方式">
              <button role="tab" aria-selected={eventView === 'steps'} className={eventView === 'steps' ? 'active' : ''} onClick={() => setEventView('steps')}>步骤时间线</button>
              <button role="tab" aria-selected={eventView === 'raw'} className={eventView === 'raw' ? 'active' : ''} onClick={() => setEventView('raw')}>原始事件 <span>{activeEvents.length}</span></button>
            </div>
            {eventView === 'steps'
              ? <div className="inspector-scroll"><RunTimeline events={activeEvents} /></div>
              : <div className="inspector-scroll event-log">{activeEvents.length ? [...activeEvents].reverse().map((event) => <EventItem key={event.id} event={event} />) : <div className="panel-empty"><Activity size={24} /><strong>还没有 SDK 事件</strong><span>发送一条消息后，流式事件会显示在这里。</span></div>}</div>}
          </div>
        )}
        {inspectorTab === 'sdk' && <SdkPanel diagnostics={diagnostics} session={activeSession} eventCount={activeEvents.length} onOpenLlmSettings={() => setLlmSettingsOpen(true)} />}
      </aside>

      {permission && <PermissionDialog request={permission} onDecision={(decision) => void resolvePermission(decision)} />}
      {llmSettingsOpen && llmConfig && <LlmSettingsDialog config={llmConfig} onClose={() => setLlmSettingsOpen(false)} onSave={saveLlmConfig} onClear={clearLlmConfig} />}
    </main>
  )
}

function GitPanel({ sessionId, status, diff, files, error, onRefresh, onStatus, onDiff }: {
  sessionId: string; status?: GitWorkspaceStatus; diff?: GitDiffView; files: FileTreeEntry[]; error: string
  onRefresh: () => Promise<void>; onStatus: (status: GitWorkspaceStatus) => void; onDiff: (diff: GitDiffView) => void
}) {
  const [scope, setScope] = useState<'unstaged' | 'staged'>('unstaged')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const act = async (label: string, operation: () => Promise<GitWorkspaceStatus>) => {
    setBusy(label)
    try { onStatus(await operation()); onDiff(await window.agentLab.getGitDiff(sessionId, scope)) } finally { setBusy('') }
  }
  const switchScope = async (value: 'unstaged' | 'staged') => { setScope(value); onDiff(await window.agentLab.getGitDiff(sessionId, value)) }
  const token = status?.stateToken ?? ''
  return <div className="inspector-scroll config-panel workbench-panel">
    <section><div className="panel-title-row"><h3>Git 工作区</h3><button className="icon-button" onClick={() => void onRefresh()}><RefreshCw size={14} /></button></div>
      {!status?.available ? <div className="warning-box">{status?.error || error || '当前目录不是 Git 仓库。'}</div> : <><p className="section-help"><GitBranch size={13} /> {status.branch || 'detached HEAD'} · ahead {status.ahead} / behind {status.behind}</p>
      <div className="change-list">{status.files.length ? status.files.map((file) => <div className="change-row" key={`${file.originalPath}-${file.path}`}><code>{file.indexStatus}{file.worktreeStatus}</code><span title={file.path}>{file.path}</span><div>{file.indexStatus !== ' ' && file.indexStatus !== '?' && <button disabled={Boolean(busy)} onClick={() => void act(file.path, () => window.agentLab.unstageGitFile(sessionId, file.path, token))}>取消暂存</button>}{file.worktreeStatus !== ' ' && <button disabled={Boolean(busy)} onClick={() => void act(file.path, () => window.agentLab.stageGitFile(sessionId, file.path, token))}>暂存</button>}{!file.untracked && file.worktreeStatus !== ' ' && <button disabled={Boolean(busy)} onClick={() => window.confirm(`撤销 ${file.path} 的未暂存修改？此操作不可恢复。`) && void act(file.path, () => window.agentLab.revertGitFile(sessionId, file.path, token, true))}>撤销</button>}</div></div>) : <p className="section-help">工作区干净。</p>}</div></>}
    </section>
    {status?.available && <section><div className="event-view-switch"><button className={scope === 'unstaged' ? 'active' : ''} onClick={() => void switchScope('unstaged')}>未暂存</button><button className={scope === 'staged' ? 'active' : ''} onClick={() => void switchScope('staged')}>已暂存</button></div><pre className="diff-view">{diff?.patch || '没有差异'}</pre></section>}
    {status?.available && <section><h3>创建 Commit</h3><textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="feat: describe the change"/><button className="button primary full" disabled={!message.trim() || Boolean(busy)} onClick={async () => { setBusy('commit'); try { const result = await window.agentLab.commitGit(sessionId, message, token); setMessage(''); onStatus(result.status); onDiff(await window.agentLab.getGitDiff(sessionId, scope)) } finally { setBusy('') } }}>提交已暂存变更</button></section>}
    <section><h3>文件树</h3><div className="file-tree">{files.map((entry) => <div key={entry.path}><span>{entry.kind === 'directory' ? '▸' : '·'}</span><code>{entry.path}</code></div>)}</div></section>
  </div>
}

function VerificationPanel({ sessionId, commands, runs, subagents, onRuns, onReview, onUseResult }: { sessionId: string; commands: VerificationCommand[]; runs: VerificationRun[]; subagents: SubagentRun[]; onRuns: (runs: VerificationRun[]) => void; onReview: () => Promise<void>; onUseResult: (run: VerificationRun) => void }) {
  const [running, setRunning] = useState('')
  const runCommand = async (command: VerificationCommand) => {
    setRunning(command.id)
    try { const result = await window.agentLab.runVerification(sessionId, command.id); onRuns([result, ...runs.filter((item) => item.id !== result.id)]) } finally { setRunning('') }
  }
  return <div className="inspector-scroll config-panel workbench-panel">
    <section><h3>基础只读 Review</h3><p className="section-help">Reviewer 被限制为 Read、Glob、Grep，并强制前台完成后再由主 Agent 汇总。</p><button className="button secondary full" onClick={() => void onReview()}><ShieldCheck size={14}/>审查当前未提交变更</button></section>
    <section><h3>验证命令</h3><p className="section-help">从 package.json 自动发现，使用固定参数执行并保存完整结果。</p><div className="verification-list">{commands.map((command) => <button key={command.id} disabled={Boolean(running)} onClick={() => void runCommand(command)}><Play size={13}/><span>npm run {command.label}</span>{running === command.id && <em>运行中</em>}</button>)}</div></section>
    <section><h3>最近结果</h3>{runs.length ? runs.map((run) => <details key={run.id}><summary><span className={clsx('verification-status', run.status)}>{run.status}</span><code>{run.command.label}</code><small>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : ''}</small></summary><pre className="diff-view">{run.output || '无输出'}</pre>{run.status === 'failed' && <button className="button secondary full" onClick={() => onUseResult(run)}>作为修复 Prompt</button>}</details>) : <p className="section-help">尚未运行验证。</p>}</section>
    <section><h3>子 Agent 生命周期</h3>{subagents.length ? subagents.map((agent) => <div className="subagent-row" key={agent.id}><span className={clsx('status-dot', agent.status === 'running' ? 'running' : agent.status === 'completed' ? 'idle' : 'error')}/><div><strong>{agent.agentType || 'subagent'}</strong><small>{agent.description}</small></div><code>{agent.status}</code></div>) : <p className="section-help">本会话尚无子 Agent 任务。</p>}</section>
  </div>
}

function RuntimeConfig({ config, patch, chooseDirectory }: { config: AgentConfig; patch: (value: Partial<AgentConfig>) => void; chooseDirectory: () => void }) {
  return <div className="config-panel">
    <section><h3>工作区与模型</h3><label className="field"><span>工作目录</span><button className="path-field" onClick={chooseDirectory}><Folder size={14} /><span>{config.cwd}</span></button></label><label className="field"><span>模型 <small>留空使用 SDK 默认</small></span><input value={config.model} onChange={(event) => patch({ model: event.target.value })} placeholder="claude-sonnet-5" /></label><label className="field"><span>Fallback 模型</span><input value={config.fallbackModel} onChange={(event) => patch({ fallbackModel: event.target.value })} placeholder="可选" /></label></section>
    <section><h3>执行策略</h3><label className="field"><span>权限模式</span><select value={config.permissionMode} onChange={(event) => patch({ permissionMode: event.target.value as PermissionMode })}>{['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', 'bypassPermissions'].map((value) => <option key={value}>{value}</option>)}</select></label>{config.permissionMode === 'bypassPermissions' && <div className="warning-box">此模式会跳过全部权限检查，仅用于你完全信任的工作区。</div>}<label className="field"><span>Effort</span><div className="segmented">{(['low', 'medium', 'high', 'xhigh', 'max'] as EffortLevel[]).map((level) => <button key={level} className={config.effort === level ? 'active' : ''} onClick={() => patch({ effort: level })}>{level}</button>)}</div></label><label className="field"><span>Thinking</span><select value={config.thinking.mode} onChange={(event) => patch({ thinking: { ...config.thinking, mode: event.target.value as AgentConfig['thinking']['mode'] } })}><option value="adaptive">adaptive</option><option value="enabled">fixed budget</option><option value="disabled">disabled</option></select></label>{config.thinking.mode === 'enabled' && <label className="field"><span>Thinking tokens</span><input type="number" min="1024" step="1024" value={config.thinking.budgetTokens} onChange={(event) => patch({ thinking: { ...config.thinking, budgetTokens: Number(event.target.value) } })} /></label>}</section>
    <section><h3>边界</h3><div className="field-grid"><label className="field"><span>最大 Turns</span><input type="number" min="1" value={config.maxTurns} onChange={(event) => patch({ maxTurns: Number(event.target.value) })} /></label><label className="field"><span>预算（USD）</span><input type="number" min="0" step="0.5" value={config.maxBudgetUsd} onChange={(event) => patch({ maxBudgetUsd: Number(event.target.value) })} /></label></div><label className="field"><span>Sandbox 配置</span><select value={config.sandboxProfile} onChange={(event) => patch({ sandboxProfile: event.target.value as SandboxProfile, sandboxEnabled: event.target.value !== 'full-access' })}><option value="read-only">只读</option><option value="workspace-write">工作区可写</option><option value="full-access">完全访问</option></select></label>{config.sandboxProfile === 'full-access' && <div className="warning-box">完全访问会关闭 SDK Sandbox，敏感工具仍受权限审批约束。</div>}<label className="field"><span>允许联网域名 <small>每行一个</small></span><textarea className="mono-input" rows={3} value={config.networkAllowedDomains.join('\n')} onChange={(event) => patch({ networkAllowedDomains: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label><Toggle label="文件 Checkpoint" hint="支持 SDK rewindFiles" checked={config.enableFileCheckpointing} onChange={(value) => patch({ enableFileCheckpointing: value })} /></section>
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
  const rows = [['AgentLab', diagnostics?.productVersion], ['Agent SDK', diagnostics?.sdkVersion], ['AgentLab Session', session.id], ['Claude Code Session UUID', session.sdkSessionId || '尚未初始化'], ['SQLite', diagnostics?.databasePath], ['Electron', diagnostics?.electronVersion], ['Node.js', diagnostics?.nodeVersion], ['平台', `${diagnostics?.platform} / ${diagnostics?.arch}`], ['本次事件', String(eventCount)]]
  return <div className="inspector-scroll sdk-panel"><div className="sdk-hero"><div className="brand-orbit"><BrainCircuit size={19} /></div><span className="eyebrow">RUNTIME DIAGNOSTICS</span><h3>真实 SDK，完整事件流</h3><p>AgentLab 在 Electron Main Process 中调用 Claude Agent SDK，Renderer 只通过受限 IPC 观察状态与处理授权。</p></div><div className="diagnostic-list">{rows.map(([label, value]) => <div key={label}><span>{label}</span><code title={value}>{value}</code></div>)}</div><div className="architecture-card"><strong>安全边界</strong><div><span>Renderer</span><i>IPC</i><span>Main</span><i>SDK</i><span>Claude</span></div><p>API Key 不进入前端；文件与命令工具由 SDK 子进程执行；敏感动作通过 canUseTool 回传授权。</p></div><button className="button primary full" onClick={onOpenLlmSettings}><KeyRound size={14} />配置 LLM API</button><button className="button secondary full sdk-secondary-button" onClick={() => diagnostics && window.agentLab.revealPath(diagnostics.userDataPath)}><Folder size={14} />打开 AgentLab 数据目录</button></div>
}
