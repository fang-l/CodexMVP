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
})
