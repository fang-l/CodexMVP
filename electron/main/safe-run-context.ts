import { basename } from 'node:path'
import type { AgentConfig } from '../../src/shared/types'

export interface SafeRunContext {
  task: string
  model: string
  project: string
  tools: string[]
  permissions: {
    mode: AgentConfig['permissionMode']
    sandbox: '启用' | '关闭'
  }
}

export const redactSensitiveText = (value: string) => value
  .replace(/\b(?:sk|key|token)-[a-z0-9_-]{8,}\b/gi, '[已隐藏]')
  .replace(/\bBearer\s+[a-z0-9._~+/=-]{8,}\b/gi, '[已隐藏]')
  .replace(
    /\b(api[_ -]?key|access[_ -]?token|auth[_ -]?token|secret|password)\s*[:=]\s*([^\s,;]+)/gi,
    '$1: [已隐藏]',
  )

export function createSafeRunContext(
  prompt: string,
  config: AgentConfig,
  effectiveModel: string,
): SafeRunContext {
  return {
    task: redactSensitiveText(prompt).slice(0, 800),
    model: redactSensitiveText(effectiveModel).slice(0, 120),
    project: basename(config.cwd) || '未选择工作区',
    tools: config.tools.map((tool) => redactSensitiveText(tool).slice(0, 80)),
    permissions: {
      mode: config.permissionMode,
      sandbox: config.sandboxEnabled ? '启用' : '关闭',
    },
  }
}
