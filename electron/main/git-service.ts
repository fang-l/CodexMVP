import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { GitCommitResult, GitDiffView, GitFileChange, GitWorkspaceStatus } from '../../src/shared/types'

interface CommandResult { stdout: string; stderr: string; code: number }

const cleanGitEnvironment = () => {
  const environment = { ...process.env }
  delete environment.ANTHROPIC_API_KEY
  delete environment.ANTHROPIC_AUTH_TOKEN
  return { ...environment, GIT_PAGER: 'cat', PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }
}

export class GitService {
  async status(cwd: string): Promise<GitWorkspaceStatus> {
    try {
      const repoRoot = (await this.run(cwd, ['rev-parse', '--show-toplevel'])).stdout.trim()
      const raw = (await this.run(repoRoot, ['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'])).stdout
      const headOid = await this.optional(repoRoot, ['rev-parse', 'HEAD'])
      const parsed = this.parseStatus(raw)
      const stateToken = await this.stateToken(repoRoot, raw, headOid)
      return { available: true, repoRoot, headOid: headOid || undefined, stateToken, ...parsed }
    } catch (error) {
      return { available: false, ahead: 0, behind: 0, files: [], error: error instanceof Error ? error.message : String(error) }
    }
  }

  async diff(cwd: string, scope: 'unstaged' | 'staged'): Promise<GitDiffView> {
    const status = await this.requireStatus(cwd)
    const args = scope === 'staged'
      ? ['diff', '--cached', '--no-ext-diff', '--no-color', '--src-prefix=a/', '--dst-prefix=b/', '--']
      : ['diff', '--no-ext-diff', '--no-color', '--src-prefix=a/', '--dst-prefix=b/', '--']
    const patch = (await this.run(status.repoRoot!, args)).stdout
    return { scope, patch, stateToken: status.stateToken! }
  }

  async stageFile(cwd: string, filePath: string, stateToken: string) {
    const status = await this.assertFresh(cwd, stateToken)
    await this.run(status.repoRoot!, ['add', '--', filePath])
    return this.status(status.repoRoot!)
  }

  async unstageFile(cwd: string, filePath: string, stateToken: string) {
    const status = await this.assertFresh(cwd, stateToken)
    if (status.headOid) await this.run(status.repoRoot!, ['restore', '--staged', '--', filePath])
    else await this.run(status.repoRoot!, ['rm', '--cached', '--ignore-unmatch', '--', filePath])
    return this.status(status.repoRoot!)
  }

  async revertFile(cwd: string, filePath: string, stateToken: string, confirmed: boolean) {
    if (!confirmed) throw this.error('CONFIRMATION_REQUIRED', '还没有确认撤销目标。')
    const status = await this.assertFresh(cwd, stateToken)
    const change = status.files.find((item) => item.path === filePath)
    if (!change) throw this.error('STALE_GIT_STATE', '文件状态已经变化，请刷新后重试。')
    if (change.untracked) throw this.error('UNTRACKED_DELETE_REQUIRES_FILE_SERVICE', '未跟踪文件删除需要单独确认，当前版本不会通过 Git 静默删除。')
    await this.run(status.repoRoot!, ['restore', '--worktree', '--', filePath])
    return this.status(status.repoRoot!)
  }

  async applyPatch(cwd: string, patch: string, operation: 'stage' | 'unstage' | 'revert', stateToken: string) {
    const status = await this.assertFresh(cwd, stateToken)
    if (!patch.trim() || patch.length > 2_000_000) throw this.error('INVALID_PATCH', 'Patch 为空或超过 2MB 限制。')
    const args = operation === 'stage'
      ? ['apply', '--cached', '--recount', '-']
      : operation === 'unstage'
        ? ['apply', '--cached', '--reverse', '--recount', '-']
        : ['apply', '--reverse', '--recount', '-']
    await this.run(status.repoRoot!, [...args.slice(0, -1), '--check', '-'], patch)
    await this.run(status.repoRoot!, args, patch)
    return this.status(status.repoRoot!)
  }

  async commit(cwd: string, message: string, stateToken: string): Promise<GitCommitResult> {
    const trimmed = message.trim()
    if (!trimmed) throw this.error('COMMIT_MESSAGE_REQUIRED', 'Commit message 不能为空。')
    const status = await this.assertFresh(cwd, stateToken)
    if (!status.files.some((item) => item.indexStatus !== ' ' && item.indexStatus !== '?')) {
      throw this.error('NOTHING_STAGED', '没有已暂存的变更。')
    }
    await this.run(status.repoRoot!, ['commit', '-m', trimmed])
    const oid = (await this.run(status.repoRoot!, ['rev-parse', 'HEAD'])).stdout.trim()
    return { oid, message: trimmed, status: await this.status(status.repoRoot!) }
  }

  private async requireStatus(cwd: string) {
    const status = await this.status(cwd)
    if (!status.available) throw this.error('NOT_A_GIT_REPOSITORY', status.error || '当前目录不是 Git 仓库。')
    return status
  }

  private async assertFresh(cwd: string, token: string) {
    const status = await this.requireStatus(cwd)
    if (!token || token !== status.stateToken) throw this.error('STALE_GIT_STATE', 'Git 状态已经变化，请刷新后重试。')
    return status
  }

  private parseStatus(raw: string): Omit<GitWorkspaceStatus, 'available' | 'repoRoot' | 'headOid' | 'stateToken'> {
    const entries = raw.split('\0').filter(Boolean)
    const header = entries.shift() ?? ''
    const branchMatch = header.match(/^## (.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/)
    const branch = branchMatch?.[1] === 'HEAD (no branch)' ? undefined : branchMatch?.[1]
    const upstream = branchMatch?.[2]
    const relation = branchMatch?.[3] ?? ''
    const ahead = Number(relation.match(/ahead (\d+)/)?.[1] ?? 0)
    const behind = Number(relation.match(/behind (\d+)/)?.[1] ?? 0)
    const files: GitFileChange[] = []
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const indexStatus = entry[0] ?? ' '
      const worktreeStatus = entry[1] ?? ' '
      const path = entry.slice(3)
      if ((indexStatus === 'R' || indexStatus === 'C') && entries[index + 1]) {
        files.push({ path, originalPath: entries[index + 1], indexStatus, worktreeStatus, untracked: false })
        index += 1
      } else {
        files.push({ path, indexStatus, worktreeStatus, untracked: indexStatus === '?' && worktreeStatus === '?' })
      }
    }
    return { branch, upstream, ahead, behind, files }
  }

  private async stateToken(repoRoot: string, statusRaw: string, headOid: string) {
    const staged = await this.optional(repoRoot, ['diff', '--cached', '--no-ext-diff', '--binary', '--'])
    return createHash('sha256').update(headOid).update('\0').update(statusRaw).update('\0').update(staged).digest('hex')
  }

  private async optional(cwd: string, args: string[]) {
    const result = await this.run(cwd, args, undefined, true)
    return result.code === 0 ? result.stdout.trim() : ''
  }

  private run(cwd: string, args: string[], stdin?: string, allowFailure = false): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, { cwd, shell: false, env: cleanGitEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => { if (stdout.length < 5_000_000) stdout += chunk })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { if (stderr.length < 1_000_000) stderr += chunk })
      child.on('error', reject)
      child.on('close', (code) => {
        clearTimeout(timer)
        const result = { stdout, stderr, code: code ?? -1 }
        if (result.code !== 0 && !allowFailure) reject(this.error('GIT_COMMAND_FAILED', stderr.trim() || `git ${args[0]} 失败。`))
        else resolve(result)
      })
      if (stdin !== undefined) child.stdin.end(stdin)
      else child.stdin.end()
    })
  }

  private error(code: string, message: string) {
    return Object.assign(new Error(message), { code })
  }
}
