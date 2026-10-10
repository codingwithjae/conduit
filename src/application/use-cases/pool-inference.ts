import type { AccountStorePort } from "../ports/account-store.js"
import type { ModelService } from "./model-service.js"
import type { ProviderId } from "../ports/model-provider.js"
import { providerIds } from "../ports/model-provider.js"
import { ConduitError } from "../ports/conduit-error.js"
import type { Account } from "../../domain/pool/account.js"

export interface PoolInferenceInput {
  model: string
  prompt: string
  forceApiKey?: boolean
}

export interface PoolInferenceResult {
  provider: ProviderId
  model: string
  text: string
  accountUsed?: {
    id: string
    email: string
    alias?: string | undefined
    tier?: string | undefined
  } | undefined
  rotatedFromAccounts?: string[] | undefined
}

export type AccountInferenceInvoker = (
  account: Account,
  modelId: string,
  prompt: string,
) => Promise<string>

export class PoolInferenceUseCase {
  constructor(
    private readonly store: AccountStorePort,
    private readonly modelService: ModelService,
    private readonly accountInvoker?: AccountInferenceInvoker,
  ) {}

  async execute(input: PoolInferenceInput): Promise<PoolInferenceResult> {
    const cleanPrompt = input.prompt.trim()
    if (!cleanPrompt || cleanPrompt.length > 100_000) {
      throw new ConduitError("invalid_input", "Prompt must contain between 1 and 100,000 characters.")
    }

    const { providerId, modelId } = this.resolveProviderAndModel(input.model)

    if (input.forceApiKey) {
      return this.executeViaOfficialApiKey(providerId, modelId, cleanPrompt)
    }

    const pool = await this.store.getPool(providerId)
    if (pool.accounts.length === 0) {
      // Fallback to official API key if no pool accounts exist
      return this.executeViaOfficialApiKey(providerId, modelId, cleanPrompt)
    }

    return this.executeWithPoolAutoFailover(providerId, modelId, cleanPrompt)
  }

  private async executeViaOfficialApiKey(
    providerId: ProviderId,
    modelId: string,
    prompt: string,
  ): Promise<PoolInferenceResult> {
    const response = await this.modelService.delegateTask({
      provider: providerId,
      model: modelId,
      prompt,
      confirmExternalSend: true,
    })
    return {
      provider: response.provider,
      model: response.model,
      text: response.text,
    }
  }

  private async executeWithPoolAutoFailover(
    providerId: ProviderId,
    modelId: string,
    prompt: string,
  ): Promise<PoolInferenceResult> {
    const pool = await this.store.getPool(providerId)
    const attemptedAccountIds = new Set<string>()
    const rotatedFromEmails: string[] = []

    while (attemptedAccountIds.size < pool.accounts.length) {
      let candidateIndex = pool.activeIndex
      let candidateAccount = pool.accounts[candidateIndex]

      if (!candidateAccount || attemptedAccountIds.has(candidateAccount.id)) {
        const nextIndex = pool.accounts.findIndex((acc) => !attemptedAccountIds.has(acc.id))
        if (nextIndex === -1) break
        candidateIndex = nextIndex
        candidateAccount = pool.accounts[candidateIndex]!
      }

      attemptedAccountIds.add(candidateAccount.id)

      try {
        const generatedText = await this.invokeAccount(candidateAccount, modelId, prompt)

        // Persist the active account index when candidate succeeded and differed from initial
        if (candidateIndex !== pool.activeIndex) {
          await this.store.switchActive(providerId, candidateIndex + 1)
        }

        return {
          provider: providerId,
          model: modelId,
          text: generatedText,
          accountUsed: {
            id: candidateAccount.id,
            email: candidateAccount.email,
            alias: candidateAccount.alias,
            tier: candidateAccount.tier,
          },
          rotatedFromAccounts: rotatedFromEmails.length > 0 ? rotatedFromEmails : undefined,
        }
      } catch (error: unknown) {
        const conduitError = ConduitError.from(error)
        if (conduitError.code === "rate_limited") {
          rotatedFromEmails.push(candidateAccount.email)
          continue
        }
        throw conduitError
      }
    }

    throw new ConduitError(
      "rate_limited",
      `All accounts (${pool.accounts.length}) in the ${providerId} pool have reached their rate limit.`,
    )
  }

  private async invokeAccount(account: Account, modelId: string, prompt: string): Promise<string> {
    if (this.accountInvoker) {
      return this.accountInvoker(account, modelId, prompt)
    }

    if (account.provider === "openai") {
      return this.invokeOpenAiSession(account, modelId, prompt)
    }

    return (
      await this.modelService.delegateTask({
        provider: account.provider,
        model: modelId,
        prompt,
        confirmExternalSend: true,
      })
    ).text
  }

  private async invokeOpenAiSession(account: Account, modelId: string, prompt: string): Promise<string> {
    let accessToken = account.tokens.access
    const expiresAtMs = account.tokens.expiresAt
    const isTokenExpired = !accessToken || (expiresAtMs && expiresAtMs < Date.now() + 30_000)

    if (isTokenExpired && account.tokens.refresh) {
      try {
        const refreshResponse = await fetch("https://auth.openai.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: account.tokens.refresh,
            client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
          }).toString(),
        })
        if (refreshResponse.ok) {
          const payload = (await refreshResponse.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
          if (payload.access_token) {
            accessToken = payload.access_token
            account.tokens.access = accessToken
            account.tokens.refresh = payload.refresh_token || account.tokens.refresh
            account.tokens.expiresAt = Date.now() + (payload.expires_in || 3600) * 1000
            await this.store.upsertAccount("openai", account)
          }
        }
      } catch {
        // Fall back to existing token if refresh call fails
      }
    }

    if (!accessToken) {
      throw new ConduitError("missing_credentials", "No valid access token available for OpenAI account.")
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (response.status === 429) {
      throw new ConduitError("rate_limited", "OpenAI rate limit exceeded")
    }

    if (!response.ok) {
      throw new ConduitError("provider_rejected", `OpenAI returned HTTP ${response.status}`)
    }

    const body = (await response.json()) as any
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== "string") {
      throw new ConduitError("invalid_response", "OpenAI response was empty")
    }
    return content
  }

  resolveProviderAndModel(rawModelString: string): { providerId: ProviderId; modelId: string } {
    const trimmed = rawModelString.trim()
    const firstSlashIndex = trimmed.indexOf("/")
    if (firstSlashIndex !== -1) {
      const rawProvider = trimmed.slice(0, firstSlashIndex).toLowerCase() as ProviderId
      const rawModel = trimmed.slice(firstSlashIndex + 1).trim()
      if (providerIds.includes(rawProvider) && rawModel) {
        return { providerId: rawProvider, modelId: rawModel }
      }
    }

    const lower = trimmed.toLowerCase()
    if (
      lower.startsWith("gpt") ||
      lower.startsWith("luna") ||
      lower.startsWith("sol") ||
      lower.startsWith("o1") ||
      lower.startsWith("o3") ||
      lower.startsWith("o4") ||
      lower.startsWith("o5")
    ) {
      return { providerId: "openai", modelId: trimmed }
    }
    if (lower.startsWith("gemini") || lower.startsWith("antigravity")) {
      return { providerId: "google", modelId: trimmed }
    }
    if (lower.startsWith("claude")) {
      return { providerId: "anthropic", modelId: trimmed }
    }
    if (lower.startsWith("deepseek")) {
      return { providerId: "deepseek", modelId: trimmed }
    }
    if (lower.startsWith("groq") || lower.startsWith("llama") || lower.startsWith("nemotron")) {
      return { providerId: "groq", modelId: trimmed }
    }

    return { providerId: "openai", modelId: trimmed }
  }
}
