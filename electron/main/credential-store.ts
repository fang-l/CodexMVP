import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LlmApiConfigInput, LlmApiConfigPublic } from '../../src/shared/types'

export interface SecretStorage {
  isEncryptionAvailable(): boolean
  encryptString(plainText: string): Buffer
  decryptString(encryptedValue: Buffer): string
}

interface StoredCredentials {
  version: 1
  encrypted: string
  updatedAt: number
}

const defaultConfig = (): LlmApiConfigInput => ({
  provider: 'anthropic',
  baseUrl: '',
  model: '',
  authMode: 'api_key',
  apiKey: '',
})

const maskSecret = (secret: string) => (secret ? `••••••••${secret.slice(-4)}` : '')

export class CredentialStore {
  private readonly filePath: string
  private config = defaultConfig()
  private updatedAt?: number

  constructor(private readonly userDataPath: string, private readonly secretStorage: SecretStorage) {
    this.filePath = path.join(userDataPath, 'llm-credentials.json')
  }

  async load() {
    await mkdir(this.userDataPath, { recursive: true })
    try {
      const stored = JSON.parse(await readFile(this.filePath, 'utf8')) as StoredCredentials
      if (stored.version !== 1) throw new Error('Unsupported credential format')
      if (!this.secretStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable')
      this.config = {
        ...defaultConfig(),
        ...(JSON.parse(
          this.secretStorage.decryptString(Buffer.from(stored.encrypted, 'base64')),
        ) as LlmApiConfigInput),
      }
      this.updatedAt = stored.updatedAt
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.config = defaultConfig()
      }
    }
    return this.publicConfig()
  }

  publicConfig(): LlmApiConfigPublic {
    const envKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || ''
    const hasStoredKey = Boolean(this.config.apiKey)
    return {
      provider: this.config.provider,
      baseUrl: this.config.baseUrl || process.env.ANTHROPIC_BASE_URL || '',
      model: this.config.model || process.env.ANTHROPIC_MODEL || '',
      authMode: this.config.authMode,
      apiKeyConfigured: hasStoredKey || Boolean(envKey),
      maskedApiKey: maskSecret(hasStoredKey ? this.config.apiKey : envKey),
      source: hasStoredKey ? 'app' : envKey ? 'environment' : 'none',
      encryptionAvailable: this.secretStorage.isEncryptionAvailable(),
      updatedAt: this.updatedAt,
    }
  }

  async save(input: LlmApiConfigInput) {
    if (!this.secretStorage.isEncryptionAvailable()) throw new Error('当前系统无法使用安全凭据加密，拒绝保存 API Key。')
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
    if (baseUrl) {
      const parsed = new URL(baseUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Base URL 必须使用 http:// 或 https://。')
    }
    if (input.provider === 'compatible' && !baseUrl) throw new Error('兼容网关必须填写 Base URL。')
    const apiKey = input.apiKey.trim() || this.config.apiKey
    if (input.provider !== 'environment' && !apiKey && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      throw new Error('请填写 API Key，或选择“使用启动环境”。')
    }
    this.config = { ...input, baseUrl, model: input.model.trim(), apiKey }
    this.updatedAt = Date.now()
    const stored: StoredCredentials = {
      version: 1,
      encrypted: this.secretStorage.encryptString(JSON.stringify(this.config)).toString('base64'),
      updatedAt: this.updatedAt,
    }
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.filePath)
    return this.publicConfig()
  }

  async clear() {
    this.config = defaultConfig()
    this.updatedAt = undefined
    await unlink(this.filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
    return this.publicConfig()
  }

  environment(): Record<string, string | undefined> {
    if (this.config.provider === 'environment') return {}
    const secret = this.config.apiKey || undefined
    return {
      ANTHROPIC_API_KEY: this.config.authMode === 'api_key' ? secret : undefined,
      ANTHROPIC_AUTH_TOKEN: this.config.authMode === 'bearer' ? secret : undefined,
      ANTHROPIC_BASE_URL: this.config.baseUrl || undefined,
      ANTHROPIC_MODEL: this.config.model || undefined,
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: secret ? '1' : process.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB,
    }
  }
}
