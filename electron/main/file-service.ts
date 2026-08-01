import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { FileTreeEntry } from '../../src/shared/types'

export class FileService {
  async list(root: string, relativePath = ''): Promise<FileTreeEntry[]> {
    const directory = await this.safePath(root, relativePath)
    const entries = await readdir(directory, { withFileTypes: true })
    return entries
      .filter((entry) => !['.git', 'node_modules', 'dist', 'dist-electron'].includes(entry.name))
      .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
      .slice(0, 500)
      .map((entry) => ({
        name: entry.name,
        path: path.posix.join(relativePath.split(path.sep).join('/'), entry.name),
        kind: entry.isSymbolicLink() ? 'symlink' : entry.isDirectory() ? 'directory' : 'file',
      }))
  }

  async preview(root: string, relativePath: string) {
    const target = await this.safePath(root, relativePath)
    const stat = await lstat(target)
    if (!stat.isFile() || stat.size > 1_000_000) throw new Error('只能预览 1MB 以内的文本文件。')
    const buffer = await readFile(target)
    if (buffer.includes(0)) throw new Error('二进制文件不支持文本预览。')
    return buffer.toString('utf8')
  }

  private async safePath(root: string, relativePath: string) {
    if (!root) throw new Error('请先选择工作区。')
    if (path.isAbsolute(relativePath)) throw new Error('文件路径必须相对工作区。')
    const realRoot = await realpath(root)
    const candidate = path.resolve(realRoot, relativePath || '.')
    const realCandidate = await realpath(candidate)
    if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error('文件路径超出工作区。')
    }
    return realCandidate
  }
}
