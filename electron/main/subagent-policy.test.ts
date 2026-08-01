import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk'
import { decideSubagentTool, isTerminalSubagentStatus } from './subagent-policy'

const reviewers: Record<string, AgentDefinition> = {
  reviewer: { description: 'read-only reviewer', prompt: 'review', tools: ['Read', 'Glob', 'Grep'] },
}

describe('TC-05 / TC-10 subagent policy', () => {
  it('rejects mutation, shell and network tools for read-only experts in ten repeated checks', () => {
    for (let repeat = 0; repeat < 10; repeat += 1) {
      for (const tool of ['Bash', 'Edit', 'Write', 'WebSearch', 'WebFetch', 'mcp__unsafe__write']) {
        assert.equal(decideSubagentTool(`agent-${repeat}`, tool, 'reviewer', reviewers).allowed, false)
      }
      assert.equal(decideSubagentTool(`agent-${repeat}`, 'Read', 'reviewer', reviewers).allowed, true)
    }
  })

  it('only treats SDK terminal states as complete', () => {
    assert.equal(isTerminalSubagentStatus('running'), false)
    assert.equal(isTerminalSubagentStatus('pending'), false)
    for (const status of ['completed', 'failed', 'stopped', 'killed']) assert.equal(isTerminalSubagentStatus(status), true)
  })
})
