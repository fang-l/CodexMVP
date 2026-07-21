/// <reference types="vite/client" />

import type { AgentLabApi } from './shared/types'

declare global {
  interface Window {
    agentLab: AgentLabApi
  }
}

export {}
