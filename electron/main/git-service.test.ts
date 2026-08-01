import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { GitService } from './git-service'

const execute = promisify(execFile)
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('GitService', () => {
  it('stages and commits only against a fresh state token', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agentlab-git-'))
    temporaryDirectories.push(directory)
    await execute('git', ['init', '-b', 'main'], { cwd: directory })
    await writeFile(path.join(directory, 'README.md'), 'baseline\n')
    await execute('git', ['add', 'README.md'], { cwd: directory })
    await execute('git', ['-c', 'user.name=AgentLab Test', '-c', 'user.email=test@agentlab.local', 'commit', '-m', 'baseline'], { cwd: directory })
    await writeFile(path.join(directory, 'README.md'), 'baseline\nchange\n')

    const service = new GitService()
    const initial = await service.status(directory)
    assert.equal(initial.available, true)
    assert.equal(initial.files[0].path, 'README.md')
    const staged = await service.stageFile(directory, 'README.md', initial.stateToken!)
    assert.equal(staged.files[0].indexStatus, 'M')
    await assert.rejects(() => service.unstageFile(directory, 'README.md', initial.stateToken!), /状态已经变化/)
  })
})
