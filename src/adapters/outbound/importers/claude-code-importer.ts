import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import type { AccountImporterPort, DiscoveredAccount } from "../../../application/ports/account-importer.js"
import type { QuotaWindow } from "../../../domain/pool/account.js"

export const DEFAULT_CLAUDE_CONFIG_PATH = `${homedir()}/.config/opencode/anthropic-auth.json`
export const DEFAULT_CLAUDE_AUTH_PATH = `${homedir()}/.local/share/kilo/auth.json`
export const DEFAULT_CLAUDE_STATE_PATH = `${homedir()}/.config/opencode/anthropic-auth-state.json`

interface RawQuotaWindowDetail {
  remainingPercent?: number
  usedPercent?: number
  resetsAt?: string
}

interface RawQuotaObject {
  five_hour?: RawQuotaWindowDetail
  seven_day?: RawQuotaWindowDetail
}

interface RawClaudeAccount {
  id?: string
  email?: string
  label?: string
  alias?: string
  refresh?: string
  access?: string
  expires?: number
  enabled?: boolean
  quota?: RawQuotaObject
}

interface RawClaudeRuntimeState {
  main?: { quota?: RawQuotaObject }
  accounts?: Record<string, { quota?: RawQuotaObject }>
}

export class ClaudeCodeImporter implements AccountImporterPort {
  readonly id = "claude-code"
  readonly displayName = "Claude Code"

  constructor(
    readonly configPath: string = DEFAULT_CLAUDE_CONFIG_PATH,
    readonly authPath: string = DEFAULT_CLAUDE_AUTH_PATH,
    readonly statePath: string = DEFAULT_CLAUDE_STATE_PATH,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await readFile(this.configPath, "utf8")
      return true
    } catch {
      try {
        await readFile(this.authPath, "utf8")
        return true
      } catch {
        return false
      }
    }
  }

  async discover(): Promise<DiscoveredAccount[]> {
    const discoveredAccounts: DiscoveredAccount[] = []
    const recordedRefreshTokens = new Set<string>()
    const runtimeState = await this.readRuntimeState()

    const fallbackAccounts = await this.discoverFromConfigAccounts(runtimeState, recordedRefreshTokens)
    discoveredAccounts.push(...fallbackAccounts)

    const mainAccount = await this.discoverFromMainAuth(runtimeState, recordedRefreshTokens)
    if (mainAccount) {
      discoveredAccounts.push(mainAccount)
    }

    return discoveredAccounts
  }

  private async readRuntimeState(): Promise<RawClaudeRuntimeState | null> {
    try {
      const stateContent = await readFile(this.statePath, "utf8")
      return JSON.parse(stateContent) as RawClaudeRuntimeState
    } catch {
      return null
    }
  }

  private async discoverFromConfigAccounts(
    runtimeState: RawClaudeRuntimeState | null,
    recordedTokens: Set<string>,
  ): Promise<DiscoveredAccount[]> {
    try {
      const fileContent = await readFile(this.configPath, "utf8")
      const parsedData = JSON.parse(fileContent) as { accounts?: RawClaudeAccount[] }
      if (!Array.isArray(parsedData.accounts)) return []

      const accounts: DiscoveredAccount[] = []
      for (const [accountIndex, rawAccount] of parsedData.accounts.entries()) {
        if (!rawAccount || rawAccount.enabled === false || !rawAccount.refresh) continue

        recordedTokens.add(rawAccount.refresh)
        const accountEmail = String(rawAccount.email || `claude-${accountIndex + 1}@anthropic.com`).trim()
        const accountId = rawAccount.id || `claude_${accountIndex + 1}`
        const quotaWindows = this.extractQuotaWindows(runtimeState?.accounts?.[accountId]?.quota || rawAccount.quota)

        accounts.push({
          id: accountId,
          provider: "anthropic",
          email: accountEmail,
          alias: rawAccount.label || rawAccount.alias || undefined,
          tier: "pro",
          tokens: {
            refresh: rawAccount.refresh,
            access: rawAccount.access,
            expiresAt: rawAccount.expires,
          },
          importedFrom: "claude-code",
          quotaSnapshot: quotaWindows.length > 0
            ? {
                updatedAt: new Date().toISOString(),
                windows: quotaWindows,
              }
            : undefined,
          sourceName: this.displayName,
        })
      }
      return accounts
    } catch {
      return []
    }
  }

  private async discoverFromMainAuth(
    runtimeState: RawClaudeRuntimeState | null,
    recordedTokens: Set<string>,
  ): Promise<DiscoveredAccount | null> {
    try {
      const fileContent = await readFile(this.authPath, "utf8")
      const parsedData = JSON.parse(fileContent) as { anthropic?: RawClaudeAccount & { type?: string } }
      const auth = parsedData.anthropic
      if (!auth || auth.type !== "oauth" || !auth.refresh || recordedTokens.has(auth.refresh)) {
        return null
      }

      const accountEmail = String(auth.email || "claude-main@anthropic.com").trim()
      const quotaWindows = this.extractQuotaWindows(runtimeState?.main?.quota)

      return {
        id: "claude_main",
        provider: "anthropic",
        email: accountEmail,
        alias: auth.alias || auth.label || "Main Pro",
        tier: "pro",
        tokens: {
          refresh: auth.refresh,
          access: auth.access,
          expiresAt: auth.expires,
        },
        importedFrom: "claude-code",
        quotaSnapshot: quotaWindows.length > 0
          ? {
              updatedAt: new Date().toISOString(),
              windows: quotaWindows,
            }
          : undefined,
        sourceName: this.displayName,
      }
    } catch {
      return null
    }
  }

  private extractQuotaWindows(quotaObject?: RawQuotaObject): QuotaWindow[] {
    if (!quotaObject || typeof quotaObject !== "object") return []
    const windows: QuotaWindow[] = []

    if (quotaObject.five_hour) {
      const remainingPercent = Number(
        quotaObject.five_hour.remainingPercent ??
          100 - Number(quotaObject.five_hour.usedPercent || 0),
      )
      windows.push({
        window: "5h",
        remainingPercent: Math.round(remainingPercent * 10) / 10,
        resetsAt: quotaObject.five_hour.resetsAt,
      })
    }

    if (quotaObject.seven_day) {
      const remainingPercent = Number(
        quotaObject.seven_day.remainingPercent ??
          100 - Number(quotaObject.seven_day.usedPercent || 0),
      )
      windows.push({
        window: "7d",
        remainingPercent: Math.round(remainingPercent * 10) / 10,
        resetsAt: quotaObject.seven_day.resetsAt,
      })
    }

    return windows
  }
}
