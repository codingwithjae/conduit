import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import type { AccountImporterPort, DiscoveredAccount } from "../../../application/ports/account-importer.js"
import type { QuotaWindow } from "../../../domain/pool/account.js"

export const DEFAULT_CODEX_POOL_PATH = `${homedir()}/.config/kilo/openai-accounts.json`
export const DEFAULT_CODEX_AUTH_PATH = `${homedir()}/.local/share/kilo/auth.json`

interface RawOpenAiWindow {
  used_percent?: number
  reset_after_seconds?: number
}

interface RawOpenAiRateLimitTree {
  primary_window?: RawOpenAiWindow
  secondary_window?: RawOpenAiWindow
}

interface RawOpenAiAccount {
  email?: string
  accountId?: string
  alias?: string
  plan?: string
  refresh?: string
  access?: string
  expires?: number
  usage?: {
    rate_limit?: RawOpenAiRateLimitTree
  }
}

export class CodexImporter implements AccountImporterPort {
  readonly id = "codex"
  readonly displayName = "Codex / OpenAI"

  constructor(
    readonly poolPath: string = DEFAULT_CODEX_POOL_PATH,
    readonly authPath: string = DEFAULT_CODEX_AUTH_PATH,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await readFile(this.poolPath, "utf8")
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
    const seenEmails = new Set<string>()

    const poolAccounts = await this.discoverFromPoolFile()
    for (const account of poolAccounts) {
      seenEmails.add(account.email.toLowerCase())
      discoveredAccounts.push(account)
    }

    const authAccounts = await this.discoverFromAuthFile(seenEmails)
    discoveredAccounts.push(...authAccounts)

    return discoveredAccounts
  }

  private async discoverFromPoolFile(): Promise<DiscoveredAccount[]> {
    try {
      const fileContent = await readFile(this.poolPath, "utf8")
      const parsedData = JSON.parse(fileContent) as { accounts?: RawOpenAiAccount[] }
      if (!Array.isArray(parsedData.accounts)) return []

      const accounts: DiscoveredAccount[] = []
      for (const [accountIndex, rawAccount] of parsedData.accounts.entries()) {
        if (!rawAccount?.refresh) continue

        const accountEmail = String(rawAccount.email || `openai-${accountIndex + 1}@chatgpt.com`).trim()
        const quotaWindows = this.extractRateLimitWindows(rawAccount.usage?.rate_limit)

        accounts.push({
          id: rawAccount.accountId || `oa_${accountEmail}`,
          provider: "openai",
          email: accountEmail,
          alias: rawAccount.alias || undefined,
          tier: rawAccount.plan || "plus",
          tokens: {
            refresh: rawAccount.refresh,
            access: rawAccount.access,
            expiresAt: rawAccount.expires,
          },
          importedFrom: "codex",
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

  private async discoverFromAuthFile(alreadySeenEmails: Set<string>): Promise<DiscoveredAccount[]> {
    try {
      const fileContent = await readFile(this.authPath, "utf8")
      const parsedData = JSON.parse(fileContent) as { openai?: RawOpenAiAccount & { type?: string } }
      const auth = parsedData.openai
      if (!auth || auth.type !== "oauth" || !auth.refresh) return []

      const accountEmail = String(auth.email || "openai-user@chatgpt.com").trim()
      if (alreadySeenEmails.has(accountEmail.toLowerCase())) return []

      return [
        {
          id: auth.accountId || `oa_${accountEmail}`,
          provider: "openai",
          email: accountEmail,
          alias: auth.alias || undefined,
          tier: "plus",
          tokens: {
            refresh: auth.refresh,
            access: auth.access,
            expiresAt: auth.expires,
          },
          importedFrom: "codex",
          sourceName: this.displayName,
        },
      ]
    } catch {
      return []
    }
  }

  private extractRateLimitWindows(rateLimitTree?: RawOpenAiRateLimitTree): QuotaWindow[] {
    if (!rateLimitTree || typeof rateLimitTree !== "object") return []
    const windows: QuotaWindow[] = []

    if (rateLimitTree.primary_window) {
      const remainingPercent = 100 - Number(rateLimitTree.primary_window.used_percent || 0)
      windows.push({
        window: "Primary",
        remainingPercent: Math.round(remainingPercent * 10) / 10,
        resetSeconds: rateLimitTree.primary_window.reset_after_seconds,
      })
    }

    if (rateLimitTree.secondary_window) {
      const remainingPercent = 100 - Number(rateLimitTree.secondary_window.used_percent || 0)
      windows.push({
        window: "Secondary",
        remainingPercent: Math.round(remainingPercent * 10) / 10,
        resetSeconds: rateLimitTree.secondary_window.reset_after_seconds,
      })
    }

    return windows
  }
}
