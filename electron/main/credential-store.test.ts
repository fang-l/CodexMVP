import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CredentialStore, type SecretStorage } from './credential-store'

const directories: string[] = []
const fakeSecretStorage: SecretStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (value) => value.toString('utf8').replace(/^encrypted:/, ''),
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('CredentialStore', () => {
  it('never stores the API key in plaintext', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agentlab-credentials-'))
    directories.push(directory)
    const store = new CredentialStore(directory, fakeSecretStorage)
    await store.load()
    await store.save({
      provider: 'compatible',
      baseUrl: 'https://gateway.example.com/',
      model: 'custom-model',
      authMode: 'bearer',
      apiKey: 'secret-test-key',
    })

    const disk = await readFile(path.join(directory, 'llm-credentials.json'), 'utf8')
    assert.equal(disk.includes('secret-test-key'), false)
    assert.equal(store.publicConfig().maskedApiKey, '••••••••-key')
    assert.deepEqual(store.environment(), {
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: 'secret-test-key',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com',
      ANTHROPIC_MODEL: 'custom-model',
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1',
    })
  })

  it('refuses plaintext persistence when OS encryption is unavailable', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'agentlab-credentials-'))
    directories.push(directory)
    const store = new CredentialStore(directory, { ...fakeSecretStorage, isEncryptionAvailable: () => false })
    await assert.rejects(
      () =>
        store.save({
          provider: 'anthropic',
          baseUrl: '',
          model: '',
          authMode: 'api_key',
          apiKey: 'secret',
        }),
      /无法使用安全凭据加密/,
    )
  })
})
