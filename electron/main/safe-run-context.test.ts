import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDefaultConfig } from '../../src/shared/types'
import { createSafeRunContext } from './safe-run-context'

describe('createSafeRunContext', () => {
  it('only exposes the approved context fields and redacts credentials', () => {
    const config = createDefaultConfig('/Users/example/private/AgentLab')
    config.systemPrompt = 'internal rules that must never leave the main process'
    config.mcpServersJson = '{"secret":"hidden"}'
    config.tools = ['Read', 'Bash']

    const context = createSafeRunContext(
      '检查问题，api_key=sk-secretvalue123456 and Bearer abcdefghijklmnop',
      config,
      'MiniMax-M3',
    )

    assert.deepEqual(Object.keys(context), ['task', 'model', 'project', 'tools', 'permissions'])
    assert.equal(context.project, 'AgentLab')
    assert.deepEqual(context.tools, ['Read', 'Bash'])
    assert.match(context.task, /\[已隐藏\]/)
    const serialized = JSON.stringify(context)
    assert.doesNotMatch(serialized, /secretvalue|abcdefghijklmnop|internal rules|mcpServers/i)
  })
})
