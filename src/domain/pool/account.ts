import type { ProviderId } from "../../application/ports/model-provider.js"

export interface AccountTokens {
  refresh: string
  access?: string | undefined
  expiresAt?: number | undefined
}

export interface Account {
  id: string
  provider: ProviderId
  email: string
  alias?: string | undefined
  tier?: string | undefined
  tokens: AccountTokens
  importedFrom?: ("antigravity" | "codex" | "claude-code" | "manual") | undefined
  quotaSnapshot?: QuotaSnapshot | undefined
  addedAt: number
  lastUsedAt?: number | undefined
}

export interface QuotaWindow {
  window: string
  remainingPercent: number
  resetsAt?: string | undefined
  resetSeconds?: number | undefined
}

export interface QuotaSnapshot {
  updatedAt: string
  windows: QuotaWindow[]
}

export interface AccountWithQuota extends Account {
  windows: QuotaWindow[]
}
