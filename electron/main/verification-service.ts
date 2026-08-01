import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { VerificationCommand, VerificationRun } from '../../src/shared/types'
import type { SessionStore } from './session-store'

const knownScripts = ['test', 'lint', 'typecheck', 'build:web', 'build']

export class VerificationService {
  constructor(private readonly store: SessionStore) {}

  async discover(sessionId: string): Promise<VerificationCommand[]> {
    const cwd = this.store.get(sessionId).config.cwd
    if (!cwd) return []
    try {
      const manifest = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
      return knownScripts.filter((name) => manifest.scripts?.[name]).map((name) => ({
        id: `npm:${name}`,
        label: name,
        executable: 'npm',
        args: ['run', name],
        cwd,
        source: 'discovered',
      }))
    } catch {
      return []
    }
  }

  async run(sessionId: string, commandId: string): Promise<VerificationRun> {
    const command = (await this.discover(sessionId)).find((item) => item.id === commandId)
    if (!command) throw new Error('验证命令不存在或已经变化。')
    const run: VerificationRun = {
      id: randomUUID(), sessionId, command, status: 'running', output: '', startedAt: Date.now(),
    }
    this.store.saveVerification(run)
    const result = await this.execute(command)
    run.completedAt = Date.now()
    run.durationMs = run.completedAt - run.startedAt
    run.exitCode = result.code
    run.output = result.output
    run.status = result.code === 0 ? 'passed' : 'failed'
    this.store.saveVerification(run)
    return run
  }

  private execute(command: VerificationCommand): Promise<{ code: number; output: string }> {
    return new Promise((resolve, reject) => {
      const environment = { ...process.env }
      delete environment.ANTHROPIC_API_KEY
      delete environment.ANTHROPIC_AUTH_TOKEN
      const child = spawn(command.executable, command.args, {
        cwd: command.cwd, shell: false, env: { ...environment, CI: '1', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      const append = (chunk: Buffer | string) => { output = `${output}${String(chunk)}`.slice(-1_000_000) }
      child.stdout.on('data', append)
      child.stderr.on('data', append)
      const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000)
      child.on('error', reject)
      child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, output }) })
    })
  }
}
