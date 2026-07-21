import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentConfig, ChatMessage, LabSession } from '../../src/shared/types'
import { createDefaultConfig } from '../../src/shared/types'

interface PersistedState {
  version: 1
  activeSessionId?: string
  sessions: LabSession[]
}

export class SessionStore {
  private state: PersistedState = { version: 1, sessions: [] }
  private readonly stateFile: string
  private writeQueue = Promise.resolve()

  constructor(private readonly userDataPath: string, private readonly defaultCwd: string) {
    this.stateFile = path.join(userDataPath, 'agentlab-state.json')
  }

  async load() {
    await mkdir(this.userDataPath, { recursive: true })
    try {
      const raw = await readFile(this.stateFile, 'utf8')
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed.version === 1 && Array.isArray(parsed.sessions)) this.state = parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await rename(this.stateFile, `${this.stateFile}.corrupt-${Date.now()}`).catch(() => undefined)
      }
    }
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

  async create(config?: Partial<AgentConfig>) {
    const now = Date.now()
    const session: LabSession = {
      id: randomUUID(),
      title: '新实验',
      createdAt: now,
      updatedAt: now,
      status: 'idle',
      config: { ...createDefaultConfig(this.defaultCwd), ...config },
      messages: [],
    }
    this.state.sessions.unshift(session)
    this.state.activeSessionId = session.id
    await this.save()
    return structuredClone(session)
  }

  async update(sessionId: string, patch: Partial<Pick<LabSession, 'title' | 'config' | 'status' | 'sdkSessionId' | 'lastResult'>>) {
    const session = this.get(sessionId)
    if (patch.title !== undefined) session.title = patch.title
    if (patch.config !== undefined) session.config = { ...session.config, ...patch.config }
    if (patch.status !== undefined) session.status = patch.status
    if (patch.sdkSessionId !== undefined) session.sdkSessionId = patch.sdkSessionId
    if (patch.lastResult !== undefined) session.lastResult = patch.lastResult
    session.updatedAt = Date.now()
    await this.save()
    return structuredClone(session)
  }

  async addMessage(sessionId: string, message: ChatMessage) {
    const session = this.get(sessionId)
    session.messages.push(message)
    if (session.title === '新实验' && message.role === 'user') {
      session.title = message.content.replace(/\s+/g, ' ').slice(0, 38) || '新实验'
    }
    session.updatedAt = Date.now()
    await this.save()
  }

  async delete(sessionId: string) {
    this.state.sessions = this.state.sessions.filter((item) => item.id !== sessionId)
    if (this.state.activeSessionId === sessionId) this.state.activeSessionId = this.state.sessions[0]?.id
    await this.save()
  }

  private async save() {
    const payload = JSON.stringify(this.state, null, 2)
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = `${this.stateFile}.tmp`
      await writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.stateFile)
    })
    await this.writeQueue
  }
}
