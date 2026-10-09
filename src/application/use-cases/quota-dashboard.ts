import type { AccountStorePort } from "../ports/account-store.js"
import type { ProviderId } from "../ports/model-provider.js"
import type { Account, AccountWithQuota, QuotaWindow } from "../../domain/pool/account.js"
import type { AccountImporterPort } from "../ports/account-importer.js"
import { AntigravityImporter } from "../../adapters/outbound/importers/antigravity-importer.js"
import { ClaudeCodeImporter } from "../../adapters/outbound/importers/claude-code-importer.js"
import { CodexImporter } from "../../adapters/outbound/importers/codex-importer.js"

export interface PoolQuotaView {
  provider: ProviderId
  activeIndex: number
  accounts: AccountWithQuota[]
}

interface OpenAiRateLimitWindow {
  used_percent?: number
  reset_after_seconds?: number
}

interface OpenAiUsageResponse {
  plan_type?: string
  rate_limit?: {
    primary_window?: OpenAiRateLimitWindow
    secondary_window?: OpenAiRateLimitWindow
  }
}

export class QuotaDashboardUseCase {
  private readonly importers: AccountImporterPort[]

  constructor(
    private readonly store: AccountStorePort,
    importers?: AccountImporterPort[],
  ) {
    this.importers = importers || [
      new AntigravityImporter(),
      new CodexImporter(),
      new ClaudeCodeImporter(),
    ]
  }

  async getView(forceRefresh = false): Promise<PoolQuotaView[]> {
    if (forceRefresh) {
      await this.refreshSnapshots()
    }

    const state = await this.store.load()
    const poolViews: PoolQuotaView[] = []

    for (const [rawProviderId, pool] of Object.entries(state.pools)) {
      if (pool.accounts.length === 0) continue

      const providerId = rawProviderId as ProviderId
      const accountsWithQuota: AccountWithQuota[] = pool.accounts.map((account) => ({
        ...account,
        windows: this.resolveAccountQuota(account),
      }))

      poolViews.push({
        provider: providerId,
        activeIndex: pool.activeIndex,
        accounts: accountsWithQuota,
      })
    }
    return poolViews
  }

  resolveAccountQuota(account: Account): QuotaWindow[] {
    const existingSnapshot = account.quotaSnapshot
    if (existingSnapshot && existingSnapshot.windows.length > 0) {
      return existingSnapshot.windows.map((window) => ({
        ...window,
        resetSeconds: window.resetsAt ? this.computeResetSeconds(window.resetsAt) : window.resetSeconds,
      }))
    }

    return []
  }

  private computeResetSeconds(resetsAtIso: string): number {
    const targetTimestampMs = new Date(resetsAtIso).getTime()
    if (Number.isNaN(targetTimestampMs)) return 0
    return Math.max(0, Math.round((targetTimestampMs - Date.now()) / 1000))
  }

  async refreshSnapshots(): Promise<void> {
    await this.refreshLocalImportedSnapshots()
    await this.refreshOpenAiAccountsLiveQuota()
  }

  private async refreshLocalImportedSnapshots(): Promise<void> {
    for (const importer of this.importers) {
      if (!(await importer.isAvailable())) continue

      const discoveredAccounts = await importer.discover()
      for (const discoveredAccount of discoveredAccounts) {
        if (discoveredAccount.quotaSnapshot) {
          await this.store.upsertAccount(discoveredAccount.provider, discoveredAccount)
        }
      }
    }
  }

  private async refreshOpenAiAccountsLiveQuota(): Promise<void> {
    const state = await this.store.load()
    const openAiPool = state.pools.openai
    if (!openAiPool?.accounts.length) return

    for (const account of openAiPool.accounts) {
      await this.refreshSingleOpenAiAccountQuota(account)
    }
  }

  private async refreshSingleOpenAiAccountQuota(account: Account): Promise<void> {
    try {
      const accessToken = await this.resolveValidOpenAiAccessToken(account)
      if (!accessToken) return

      const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "ChatGPT-Account-Id": account.id || "",
          Accept: "application/json",
        },
      })
      if (!response.ok) return

      const usageData = (await response.json()) as OpenAiUsageResponse
      const parsedWindows = this.extractOpenAiUsageWindows(usageData.rate_limit)

      if (parsedWindows.length > 0) {
        account.quotaSnapshot = {
          updatedAt: new Date().toISOString(),
          windows: parsedWindows,
        }
        if (usageData.plan_type) {
          account.tier = usageData.plan_type
        }
        await this.store.upsertAccount("openai", account)
      }
    } catch {
      // Silently continue if network is unavailable during refresh
    }
  }

  private async resolveValidOpenAiAccessToken(account: Account): Promise<string | undefined> {
    const currentAccessToken = account.tokens.access
    const expiresAtMs = account.tokens.expiresAt
    const isTokenStillValid = currentAccessToken && (!expiresAtMs || expiresAtMs >= Date.now() + 30_000)

    if (isTokenStillValid) {
      return currentAccessToken
    }

    const refreshResponse = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: account.tokens.refresh,
        client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      }).toString(),
    })
    if (!refreshResponse.ok) return undefined

    const tokenPayload = (await refreshResponse.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!tokenPayload.access_token) return undefined

    account.tokens.access = tokenPayload.access_token
    account.tokens.refresh = tokenPayload.refresh_token || account.tokens.refresh
    account.tokens.expiresAt = Date.now() + (tokenPayload.expires_in || 3600) * 1000
    return tokenPayload.access_token
  }

  private extractOpenAiUsageWindows(rateLimitTree?: OpenAiUsageResponse["rate_limit"]): QuotaWindow[] {
    if (!rateLimitTree) return []
    const windows: QuotaWindow[] = []

    if (rateLimitTree.primary_window) {
      const remainingFraction = 100 - Number(rateLimitTree.primary_window.used_percent || 0)
      windows.push({
        window: "5h",
        remainingPercent: Math.round(remainingFraction * 10) / 10,
        resetSeconds: rateLimitTree.primary_window.reset_after_seconds,
      })
    }

    if (rateLimitTree.secondary_window) {
      const remainingFraction = 100 - Number(rateLimitTree.secondary_window.used_percent || 0)
      windows.push({
        window: "7d",
        remainingPercent: Math.round(remainingFraction * 10) / 10,
        resetSeconds: rateLimitTree.secondary_window.reset_after_seconds,
      })
    }

    return windows
  }

  formatPlainText(poolViews: PoolQuotaView[]): string {
    const outputLines: string[] = ["CONDUIT QUOTA DASHBOARD", ""]
    if (poolViews.length === 0) {
      outputLines.push("No hay cuentas configuradas en ningún pool. Ejecuta 'conduit account import'.")
      return outputLines.join("\n")
    }

    for (const poolView of poolViews) {
      const providerSectionLines = this.formatProviderPoolView(poolView)
      outputLines.push(...providerSectionLines, "")
    }

    return outputLines.join("\n").trim()
  }

  private formatProviderPoolView(poolView: PoolQuotaView): string[] {
    const lines: string[] = [poolView.provider.toUpperCase()]

    for (const [accountIndex, account] of poolView.accounts.entries()) {
      const accountLines = this.formatAccountRows(account, accountIndex, poolView.activeIndex)
      lines.push(...accountLines)
    }

    return lines
  }

  private formatAccountRows(
    account: AccountWithQuota,
    accountIndex: number,
    activeAccountIndex: number,
  ): string[] {
    const activeLabel = accountIndex === activeAccountIndex ? " (activa)" : ""
    const displayName = account.alias ? `${account.alias} (${account.email})` : account.email
    const tierLabel = account.tier ? ` · ${account.tier}` : ""
    const headerLine = `  ${accountIndex + 1}. ${displayName}${tierLabel}${activeLabel}`

    if (account.windows.length === 0) {
      return [headerLine, "     (Cuota no disponible en caché · presiona 'r' o usa --refresh)"]
    }

    const windowLines = account.windows.map((window) => this.formatQuotaWindowRow(window))
    return [headerLine, ...windowLines]
  }

  private formatQuotaWindowRow(window: QuotaWindow): string {
    const visualProgressBar = this.renderProgressBar(window.remainingPercent)
    const formattedResetDuration = this.formatDuration(window.resetSeconds)
    const resetNotice = formattedResetDuration ? ` · resets in ${formattedResetDuration}` : ""
    return `     ${window.window.padEnd(8)} [${visualProgressBar}] ${window.remainingPercent}%${resetNotice}`
  }

  formatDuration(totalSeconds?: number): string {
    if (totalSeconds == null || totalSeconds <= 0) return ""
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  renderProgressBar(remainingPercentage: number, characterWidth = 10): string {
    const boundedPercentage = Math.max(0, Math.min(100, remainingPercentage))
    const filledCount = Math.round((boundedPercentage / 100) * characterWidth)
    const emptyCount = characterWidth - filledCount
    return "█".repeat(filledCount) + "░".repeat(emptyCount)
  }
}
