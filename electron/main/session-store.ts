import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type {
  AgentConfig,
  ChatMessage,
  LabSession,
  Project,
  RuntimeEvent,
  SubagentRun,
  VerificationRun,
} from '../../src/shared/types'
import { createDefaultConfig } from '../../src/shared/types'

interface LegacyPersistedState {
  version: 1
  activeSessionId?: string
  sessions: LabSession[]
}

type SessionPatch = Partial<Pick<LabSession, 'title' | 'config' | 'status' | 'sdkSessionId' | 'lastResult'>>

export class SessionStore {
  private state: { activeProjectId?: string; activeSessionId?: string; projects: Project[]; sessions: LabSession[] } = { projects: [], sessions: [] }
  private readonly legacyStateFile: string
  readonly databasePath: string
  private database?: DatabaseSync

  constructor(private readonly userDataPath: string, private readonly defaultCwd: string) {
    this.legacyStateFile = path.join(userDataPath, 'agentlab-state.json')
    this.databasePath = path.join(userDataPath, 'agentlab-v3.sqlite')
  }

  async load() {
    await mkdir(this.userDataPath, { recursive: true })
    this.database = new DatabaseSync(this.databasePath)
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    this.createSchema()
    await this.importLegacyStateIfNeeded()
    this.loadStateFromDatabase()
    this.recoverInterruptedTurns()
    return this.snapshot()
  }

  snapshot() {
    return structuredClone(this.state)
  }

  get(sessionId: string) {
    const session = this.state.sessions.find((item) => item.id === sessionId)
    if (!session) throw new Error(`Unknown AgentLab session: ${sessionId}`)
    return session
  }

  async create(config?: Partial<AgentConfig>, requestedProjectId?: string) {
    const now = Date.now()
    const resolvedConfig = { ...createDefaultConfig(this.defaultCwd), ...config }
    const project = requestedProjectId
      ? this.getProject(requestedProjectId)
      : this.ensureProject(resolvedConfig.cwd)
    const session: LabSession = {
      id: randomUUID(),
      projectId: project.id,
      title: '新实验',
      createdAt: now,
      updatedAt: now,
      status: 'idle',
      config: { ...resolvedConfig, cwd: project.rootPath },
      messages: [],
    }
    this.state.sessions.unshift(session)
    this.state.activeProjectId = project.id
    this.state.activeSessionId = session.id
    this.persistSession(session)
    this.persistAppState()
    return structuredClone(session)
  }

  async update(sessionId: string, patch: SessionPatch) {
    const session = this.get(sessionId)
    if (patch.title !== undefined) session.title = patch.title
    if (patch.config !== undefined) {
      session.config = { ...session.config, ...patch.config }
      if (patch.config.cwd !== undefined) {
        const project = this.ensureProject(patch.config.cwd)
        session.projectId = project.id
        session.config.cwd = project.rootPath
        this.state.activeProjectId = project.id
      }
    }
    if (patch.status !== undefined) session.status = patch.status
    if (patch.sdkSessionId !== undefined) session.sdkSessionId = patch.sdkSessionId
    if (patch.lastResult !== undefined) session.lastResult = patch.lastResult
    session.updatedAt = Date.now()
    this.persistSession(session)
    this.persistAppState()
    return structuredClone(session)
  }

  async addMessage(sessionId: string, message: ChatMessage) {
    const session = this.get(sessionId)
    if (!session.messages.some((item) => item.id === message.id)) session.messages.push(message)
    if (session.title === '新实验' && message.role === 'user') {
      session.title = message.content.replace(/\s+/g, ' ').slice(0, 38) || '新实验'
    }
    session.updatedAt = Date.now()
    this.persistSession(session)
    this.db().prepare(`
      INSERT OR REPLACE INTO messages (id, session_id, role, content, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(message.id, sessionId, message.role, message.content, message.createdAt, JSON.stringify(message.metadata ?? null))
  }

  async delete(sessionId: string) {
    this.state.sessions = this.state.sessions.filter((item) => item.id !== sessionId)
    if (this.state.activeSessionId === sessionId) this.state.activeSessionId = this.state.sessions[0]?.id
    this.db().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    this.persistAppState()
  }

  listProjects() { return structuredClone(this.state.projects) }

  async createProject(rootPath: string) { return structuredClone(this.ensureProject(rootPath)) }

  private getProject(projectId: string) {
    const project = this.state.projects.find((item) => item.id === projectId)
    if (!project) throw new Error(`Unknown AgentLab project: ${projectId}`)
    return project
  }

  beginTurn(sessionId: string, prompt: string) {
    const id = randomUUID()
    const now = Date.now()
    const ordinalRow = this.db().prepare('SELECT COALESCE(MAX(ordinal), 0) AS value FROM turns WHERE session_id = ?').get(sessionId) as { value: number }
    this.db().prepare(`
      INSERT INTO turns (id, session_id, ordinal, status, prompt, started_at)
      VALUES (?, ?, ?, 'running', ?, ?)
    `).run(id, sessionId, Number(ordinalRow.value) + 1, prompt, now)
    return id
  }

  finishTurn(turnId: string, status: 'completed' | 'failed' | 'interrupted', errorCode?: string) {
    this.db().prepare(`
      UPDATE turns SET status = ?, completed_at = ?, error_code = ? WHERE id = ?
    `).run(status, Date.now(), errorCode ?? null, turnId)
  }

  addEvent(event: RuntimeEvent) {
    this.db().prepare(`
      INSERT OR REPLACE INTO events
        (id, session_id, turn_id, sequence, kind, label, text, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.sessionId,
      event.turnId ?? null,
      this.nextEventSequence(event.sessionId),
      event.kind,
      event.label,
      event.text ?? null,
      JSON.stringify({
        data: event.data,
        sdkSessionId: event.sdkSessionId,
        toolName: event.toolName,
        toolUseId: event.toolUseId,
        parentToolUseId: event.parentToolUseId,
      }),
      event.timestamp,
    )
  }

  listEvents(sessionId: string, limit = 1000, before = Number.MAX_SAFE_INTEGER): RuntimeEvent[] {
    const rows = this.db().prepare(`
      SELECT * FROM events WHERE session_id = ? AND created_at < ?
      ORDER BY sequence DESC LIMIT ?
    `).all(sessionId, before, Math.max(1, Math.min(limit, 5000))) as Array<Record<string, unknown>>
    return rows.reverse().map((row) => {
      const payload = JSON.parse(String(row.payload_json ?? '{}')) as Record<string, unknown>
      return {
        id: String(row.id),
        sessionId: String(row.session_id),
        turnId: row.turn_id ? String(row.turn_id) : undefined,
        timestamp: Number(row.created_at),
        kind: String(row.kind) as RuntimeEvent['kind'],
        label: String(row.label),
        text: row.text === null ? undefined : String(row.text),
        data: payload.data,
        sdkSessionId: payload.sdkSessionId as string | undefined,
        toolName: payload.toolName as string | undefined,
        toolUseId: payload.toolUseId as string | undefined,
        parentToolUseId: payload.parentToolUseId as string | null | undefined,
      }
    })
  }

  savePermission(input: {
    id: string; sessionId: string; turnId?: string; agentId?: string; toolName: string
    toolUseId: string; input: Record<string, unknown>; decision?: string; decidedAt?: number
  }) {
    this.db().prepare(`
      INSERT INTO permissions
        (id, session_id, turn_id, agent_id, tool_name, tool_use_id, input_json, decision, requested_at, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at
    `).run(
      input.id, input.sessionId, input.turnId ?? null, input.agentId ?? null, input.toolName,
      input.toolUseId, JSON.stringify(input.input), input.decision ?? null, Date.now(), input.decidedAt ?? null,
    )
  }

  saveVerification(run: VerificationRun) {
    this.db().prepare(`
      INSERT OR REPLACE INTO verifications
        (id, session_id, command_json, status, exit_code, duration_ms, output, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.sessionId,
      JSON.stringify(run.command),
      run.status,
      run.exitCode ?? null,
      run.durationMs ?? null,
      run.output.slice(-1_000_000),
      run.startedAt,
      run.completedAt ?? null,
    )
  }

  listVerifications(sessionId: string): VerificationRun[] {
    const rows = this.db().prepare('SELECT * FROM verifications WHERE session_id = ? ORDER BY started_at DESC').all(sessionId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      command: JSON.parse(String(row.command_json)),
      status: String(row.status) as VerificationRun['status'],
      exitCode: row.exit_code === null ? undefined : Number(row.exit_code),
      durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
      output: String(row.output ?? ''),
      startedAt: Number(row.started_at),
      completedAt: row.completed_at === null ? undefined : Number(row.completed_at),
    }))
  }

  upsertSubagent(run: SubagentRun) {
    this.db().prepare(`
      INSERT OR REPLACE INTO subagent_runs
        (id, session_id, turn_id, task_id, agent_id, agent_type, description, status, summary,
         last_tool_name, total_tokens, tool_uses, duration_ms, error, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id, run.sessionId, run.turnId ?? null, run.taskId, run.agentId ?? null,
      run.agentType ?? null, run.description, run.status, run.summary ?? null,
      run.lastToolName ?? null, run.totalTokens ?? null, run.toolUses ?? null,
      run.durationMs ?? null, run.error ?? null, run.startedAt, run.completedAt ?? null,
    )
  }

  listSubagents(sessionId: string): SubagentRun[] {
    const rows = this.db().prepare('SELECT * FROM subagent_runs WHERE session_id = ? ORDER BY started_at').all(sessionId) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id: String(row.id), sessionId: String(row.session_id), turnId: row.turn_id ? String(row.turn_id) : undefined,
      taskId: String(row.task_id), agentId: row.agent_id ? String(row.agent_id) : undefined,
      agentType: row.agent_type ? String(row.agent_type) : undefined, description: String(row.description),
      status: String(row.status) as SubagentRun['status'], summary: row.summary ? String(row.summary) : undefined,
      lastToolName: row.last_tool_name ? String(row.last_tool_name) : undefined,
      totalTokens: row.total_tokens === null ? undefined : Number(row.total_tokens),
      toolUses: row.tool_uses === null ? undefined : Number(row.tool_uses),
      durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
      error: row.error ? String(row.error) : undefined, startedAt: Number(row.started_at),
      completedAt: row.completed_at === null ? undefined : Number(row.completed_at),
    }))
  }

  private createSchema() {
    this.db().exec(`
      CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        project_id TEXT, status TEXT NOT NULL, config_json TEXT NOT NULL, sdk_session_id TEXT, last_result_json TEXT
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, metadata_json TEXT
      );
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL, status TEXT NOT NULL, prompt TEXT NOT NULL, started_at INTEGER NOT NULL,
        completed_at INTEGER, error_code TEXT, UNIQUE(session_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL, sequence INTEGER NOT NULL, kind TEXT NOT NULL,
        label TEXT NOT NULL, text TEXT, payload_json TEXT, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_session_sequence ON events(session_id, sequence);
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        command_json TEXT NOT NULL, status TEXT NOT NULL, exit_code INTEGER, duration_ms INTEGER,
        output TEXT NOT NULL, started_at INTEGER NOT NULL, completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL, agent_id TEXT, tool_name TEXT NOT NULL,
        tool_use_id TEXT NOT NULL, input_json TEXT NOT NULL, decision TEXT, requested_at INTEGER NOT NULL,
        decided_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS subagent_runs (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL, task_id TEXT NOT NULL, agent_id TEXT,
        agent_type TEXT, description TEXT NOT NULL, status TEXT NOT NULL, summary TEXT, last_tool_name TEXT,
        total_tokens INTEGER, tool_uses INTEGER, duration_ms INTEGER, error TEXT,
        started_at INTEGER NOT NULL, completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_subagents_session ON subagent_runs(session_id, started_at);
    `)
    const columns = this.db().prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'project_id')) this.db().exec('ALTER TABLE sessions ADD COLUMN project_id TEXT')
  }

  private async importLegacyStateIfNeeded() {
    const count = this.db().prepare('SELECT COUNT(*) AS value FROM sessions').get() as { value: number }
    if (Number(count.value) > 0) return
    try {
      const raw = await readFile(this.legacyStateFile, 'utf8')
      const parsed = JSON.parse(raw) as LegacyPersistedState
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return
      this.db().exec('BEGIN IMMEDIATE')
      try {
        for (const session of parsed.sessions) {
          const legacyConfig = session.config as Partial<AgentConfig>
          const migratedConfig = { ...createDefaultConfig(session.config.cwd), ...legacyConfig }
          if (!legacyConfig.sandboxProfile) {
            migratedConfig.sandboxProfile = legacyConfig.sandboxEnabled === false ? 'full-access' : 'workspace-write'
          }
          const migrated = { ...session, config: migratedConfig }
          this.persistSession(migrated)
          for (const message of migrated.messages) {
            this.db().prepare(`INSERT OR REPLACE INTO messages VALUES (?, ?, ?, ?, ?, ?)`)
              .run(message.id, migrated.id, message.role, message.content, message.createdAt, JSON.stringify(message.metadata ?? null))
          }
        }
        this.db().prepare('INSERT OR REPLACE INTO app_state VALUES (?, ?)').run('activeSessionId', parsed.activeSessionId ?? '')
        this.db().prepare('INSERT OR REPLACE INTO app_state VALUES (?, ?)').run('legacy_import_v1', String(Date.now()))
        this.db().exec('COMMIT')
      } catch (error) {
        this.db().exec('ROLLBACK')
        throw error
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  private loadStateFromDatabase() {
    const projectRows = this.db().prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>
    this.state.projects = projectRows.map((row) => ({
      id: String(row.id), name: String(row.name), rootPath: String(row.root_path),
      createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
    }))
    const rows = this.db().prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>
    this.state.sessions = rows.map((row) => {
      const storedConfig = JSON.parse(String(row.config_json)) as Partial<AgentConfig>
      const config = { ...createDefaultConfig(this.defaultCwd), ...storedConfig }
      if (!storedConfig.sandboxProfile) config.sandboxProfile = storedConfig.sandboxEnabled === false ? 'full-access' : 'workspace-write'
      const messages = this.db().prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at').all(String(row.id)) as Array<Record<string, unknown>>
      const projectId = row.project_id ? String(row.project_id) : this.ensureProject(config.cwd).id
      if (!row.project_id) this.db().prepare('UPDATE sessions SET project_id = ? WHERE id = ?').run(projectId, String(row.id))
      return {
        id: String(row.id), title: String(row.title), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
        projectId, status: String(row.status) as LabSession['status'], config,
        sdkSessionId: row.sdk_session_id ? String(row.sdk_session_id) : undefined,
        lastResult: row.last_result_json ? JSON.parse(String(row.last_result_json)) : undefined,
        messages: messages.map((message) => ({
          id: String(message.id), role: String(message.role) as ChatMessage['role'], content: String(message.content),
          createdAt: Number(message.created_at), metadata: message.metadata_json ? JSON.parse(String(message.metadata_json)) : undefined,
        })),
      }
    })
    const active = this.db().prepare('SELECT value FROM app_state WHERE key = ?').get('activeSessionId') as { value?: string } | undefined
    this.state.activeSessionId = active?.value && this.state.sessions.some((item) => item.id === active.value)
      ? active.value
      : this.state.sessions[0]?.id
    const activeProject = this.db().prepare('SELECT value FROM app_state WHERE key = ?').get('activeProjectId') as { value?: string } | undefined
    this.state.activeProjectId = activeProject?.value && this.state.projects.some((item) => item.id === activeProject.value)
      ? activeProject.value
      : this.state.sessions.find((item) => item.id === this.state.activeSessionId)?.projectId
  }

  private recoverInterruptedTurns() {
    const rows = this.db().prepare(`SELECT id, session_id FROM turns WHERE status IN ('queued', 'running', 'waiting_permission')`).all() as Array<{ id: string; session_id: string }>
    for (const row of rows) {
      this.finishTurn(row.id, 'interrupted', 'client_restart')
      const session = this.state.sessions.find((item) => item.id === row.session_id)
      if (session) {
        session.status = 'idle'
        this.persistSession(session)
      }
    }
  }

  private persistSession(session: LabSession) {
    this.db().prepare(`
      INSERT INTO sessions
        (id, title, created_at, updated_at, project_id, status, config_json, sdk_session_id, last_result_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, updated_at = excluded.updated_at, status = excluded.status,
        project_id = excluded.project_id,
        config_json = excluded.config_json, sdk_session_id = excluded.sdk_session_id,
        last_result_json = excluded.last_result_json
    `).run(
      session.id, session.title, session.createdAt, session.updatedAt, session.projectId ?? null, session.status,
      JSON.stringify(session.config), session.sdkSessionId ?? null, JSON.stringify(session.lastResult ?? null),
    )
  }

  private persistAppState() {
    this.db().prepare('INSERT OR REPLACE INTO app_state VALUES (?, ?)').run('activeSessionId', this.state.activeSessionId ?? '')
    this.db().prepare('INSERT OR REPLACE INTO app_state VALUES (?, ?)').run('activeProjectId', this.state.activeProjectId ?? '')
  }

  private ensureProject(rootPath: string) {
    const normalized = path.resolve(rootPath || this.defaultCwd)
    const existing = this.state.projects.find((item) => item.rootPath === normalized)
    if (existing) {
      existing.updatedAt = Date.now()
      this.persistProject(existing)
      return existing
    }
    const project: Project = { id: randomUUID(), name: path.basename(normalized) || normalized, rootPath: normalized, createdAt: Date.now(), updatedAt: Date.now() }
    this.state.projects.unshift(project)
    this.persistProject(project)
    return project
  }

  private persistProject(project: Project) {
    this.db().prepare(`
      INSERT INTO projects (id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(root_path) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    `).run(project.id, project.name, project.rootPath, project.createdAt, project.updatedAt)
  }

  private nextEventSequence(sessionId: string) {
    const row = this.db().prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS value FROM events WHERE session_id = ?').get(sessionId) as { value: number }
    return Number(row.value)
  }

  private db() {
    if (!this.database) throw new Error('SessionStore has not been loaded.')
    return this.database
  }
}
