import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SessionStore } from './session-store'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('SessionStore', () => {
  it('persists sessions and messages atomically', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agentlab-test-'))
    temporaryDirectories.push(directory)
    const store = new SessionStore(directory, '/workspace')
    await store.load()

    const session = await store.create()
    await store.addMessage(session.id, {
      id: 'message-1',
      role: 'user',
      content: 'Inspect this repository',
      createdAt: 1,
    })
    await store.update(session.id, { sdkSessionId: 'sdk-session-1', status: 'idle' })

    const restored = new SessionStore(directory, '/fallback')
    const snapshot = await restored.load()
    assert.equal(snapshot.sessions.length, 1)
    assert.equal(snapshot.sessions[0].config.cwd, '/workspace')
    assert.equal(snapshot.sessions[0].sdkSessionId, 'sdk-session-1')
    assert.equal(snapshot.sessions[0].title, 'Inspect this repository')
    assert.equal(snapshot.sessions[0].messages[0].content, 'Inspect this repository')
  })

  it('persists turn events and marks unfinished work interrupted after restart', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agentlab-turn-test-'))
    temporaryDirectories.push(directory)
    const store = new SessionStore(directory, '/workspace')
    await store.load()
    const session = await store.create()
    const turnId = store.beginTurn(session.id, 'run three reviewers')
    store.addEvent({ id: 'event-1', sessionId: session.id, turnId, timestamp: 100, kind: 'subagent', label: 'reviewer started' })

    const restored = new SessionStore(directory, '/workspace')
    await restored.load()
    assert.equal(restored.listEvents(session.id)[0].turnId, turnId)
    assert.equal(restored.get(session.id).status, 'idle')
  })

  it('migrates sessions into shared projects by workspace path', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agentlab-project-test-'))
    temporaryDirectories.push(directory)
    const store = new SessionStore(directory, '/workspace')
    await store.load()
    const first = await store.create({ cwd: '/workspace/repository-a' })
    const second = await store.create({ cwd: '/workspace/repository-a' })
    const third = await store.create({ cwd: '/workspace/repository-b' })

    assert.equal(first.projectId, second.projectId)
    assert.notEqual(first.projectId, third.projectId)
    assert.equal(store.listProjects().length, 2)

    const restored = new SessionStore(directory, '/fallback')
    const snapshot = await restored.load()
    assert.equal(snapshot.projects.length, 2)
    assert.equal(snapshot.sessions.find((session) => session.id === first.id)?.projectId, second.projectId)
  })
})
