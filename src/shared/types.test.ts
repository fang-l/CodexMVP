import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultConfig, DEFAULT_TOOLS } from './types'

describe('createDefaultConfig', () => {
  it('starts safe and observable', () => {
    const config = createDefaultConfig('/workspace')
    assert.equal(config.cwd, '/workspace')
    assert.equal(config.permissionMode, 'default')
    assert.deepEqual(config.allowedTools, ['Read', 'Glob', 'Grep'])
    assert.deepEqual(config.disallowedTools, [])
    assert.equal(config.includePartialMessages, true)
    assert.equal(config.includeHookEvents, true)
    assert.equal(config.enableFileCheckpointing, true)
    assert.deepEqual(config.tools, DEFAULT_TOOLS)
  })

  it('returns fresh arrays for every session', () => {
    const first = createDefaultConfig('/one')
    const second = createDefaultConfig('/two')
    first.tools.pop()
    assert.equal(second.tools.length, DEFAULT_TOOLS.length)
  })
})
