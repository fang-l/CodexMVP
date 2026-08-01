import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk'

const readOnlyTools = ['Read', 'Glob', 'Grep']

export interface SubagentToolDecision {
  allowed: boolean
  reason?: string
}

export function decideSubagentTool(
  agentId: string,
  toolName: string,
  agentType: string | undefined,
  definitions: Record<string, AgentDefinition>,
): SubagentToolDecision {
  const declared = agentType ? definitions[agentType]?.tools : undefined
  const allowedTools = Array.isArray(declared) ? declared : readOnlyTools
  if (allowedTools.includes(toolName)) return { allowed: true }
  return {
    allowed: false,
    reason: agentType
      ? `子 Agent ${agentType} 未声明工具 ${toolName}。`
      : `无法识别子 Agent ${agentId} 的权限，已按只读策略拒绝 ${toolName}。`,
  }
}

export const isTerminalSubagentStatus = (status: string) =>
  ['completed', 'failed', 'stopped', 'killed'].includes(status)
