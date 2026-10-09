import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import type { AccountImporterPort, DiscoveredAccount } from "../../../application/ports/account-importer.js"
import type { QuotaWindow } from "../../../domain/pool/account.js"

export const DEFAULT_ANTIGRAVITY_PATH = `${homedir()}/.config/opencode/antigravity-accounts.json`

interface RawAntigravityWindow {
  window?: string
  remainingFraction?: number
  resetTime?: string
}

interface RawAntigravityAccount {
  email?: string
  label?: string
  alias?: string
  refreshToken?: string
  capturedPaidTierId?: string
  capturedTierId?: string
  enabled?: boolean
  cachedQuotaUpdatedAt?: string
  cachedQuota?: {
    gemini?: { windows?: RawAntigravityWindow[] }
    "non-gemini"?: { windows?: RawAntigravityWindow[] }
  }
}

export class AntigravityImporter implements AccountImporterPort {
  readonly id = "antigravity"
  readonly displayName = "Google Antigravity"

  constructor(readonly filePath: string = DEFAULT_ANTIGRAVITY_PATH) {}

  async isAvailable(): Promise<boolean> {
    try {
      await readFile(this.filePath, "utf8")
      return true
    } catch {
      return false
    }
  }

  async discover(): Promise<DiscoveredAccount[]> {
    try {
      const fileContent = await readFile(this.filePath, "utf8")
      const parsedData = JSON.parse(fileContent) as { accounts?: RawAntigravityAccount[] }
      if (!Array.isArray(parsedData.accounts)) return []

      const discoveredAccounts: DiscoveredAccount[] = []
      for (const [accountIndex, rawAccount] of parsedData.accounts.entries()) {
        if (!rawAccount || rawAccount.enabled === false) continue

        const rawRefreshToken = String(rawAccount.refreshToken || "").trim()
        if (!rawRefreshToken) continue

        const cleanRefreshToken = rawRefreshToken.replace(/\|.*$/, "")
        const accountEmail = String(rawAccount.email || `account-${accountIndex + 1}@gmail.com`).trim()
        const quotaWindows = this.extractAntigravityQuotaWindows(rawAccount.cachedQuota)

        discoveredAccounts.push({
          id: `ag_${accountEmail}`,
          provider: "google",
          email: accountEmail,
          alias: rawAccount.label || rawAccount.alias || undefined,
          tier: rawAccount.capturedPaidTierId || rawAccount.capturedTierId || "pro",
          tokens: { refresh: cleanRefreshToken },
          importedFrom: "antigravity",
          quotaSnapshot: quotaWindows.length > 0
            ? {
                updatedAt: rawAccount.cachedQuotaUpdatedAt || new Date().toISOString(),
                windows: quotaWindows,
              }
            : undefined,
          sourceName: this.displayName,
        })
      }
      return discoveredAccounts
    } catch {
      return []
    }
  }

  private extractAntigravityQuotaWindows(cachedQuotaTree?: RawAntigravityAccount["cachedQuota"]): QuotaWindow[] {
    if (!cachedQuotaTree || typeof cachedQuotaTree !== "object") return []

    const geminiWindows = this.mapFamilyQuotaWindows(cachedQuotaTree.gemini?.windows, "Gem")
    const nonGeminiWindows = this.mapFamilyQuotaWindows(cachedQuotaTree["non-gemini"]?.windows, "NonG")

    return [...geminiWindows, ...nonGeminiWindows]
  }

  private mapFamilyQuotaWindows(
    rawWindowsList: RawAntigravityWindow[] | undefined,
    familyPrefix: "Gem" | "NonG",
  ): QuotaWindow[] {
    if (!Array.isArray(rawWindowsList)) return []

    return rawWindowsList.map((rawWindow) => {
      const isWeeklyWindow = String(rawWindow.window || "").toLowerCase() === "weekly"
      const windowLabel = isWeeklyWindow ? `${familyPrefix}/Wk` : `${familyPrefix}/5h`
      const remainingFraction = Number(rawWindow.remainingFraction ?? 1)

      return {
        window: windowLabel,
        remainingPercent: Math.round(remainingFraction * 1000) / 10,
        resetsAt: rawWindow.resetTime,
      }
    })
  }
}
