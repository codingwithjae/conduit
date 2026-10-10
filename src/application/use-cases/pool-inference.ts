import type { AccountStorePort } from "../ports/account-store.js"
import type { ModelService } from "./model-service.js"
import type { ProviderId } from "../ports/model-provider.js"
import { providerIds } from "../ports/model-provider.js"
import { ConduitError } from "../ports/conduit-error.js"
import type { Account } from "../../domain/pool/account.js"
import { GoogleSessionDriver } from "../../adapters/outbound/providers/google-session.js"
import { OpenAiSessionDriver } from "../../adapters/outbound/providers/openai-session.js"

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
  private readonly googleSessionDriver: GoogleSessionDriver
  private readonly openAiSessionDriver: OpenAiSessionDriver

  constructor(
    private readonly store: AccountStorePort,
    private readonly modelService: ModelService,
    private readonly accountInvoker?: AccountInferenceInvoker,
    googleSessionDriver?: GoogleSessionDriver,
    openAiSessionDriver?: OpenAiSessionDriver,
  ) {
    this.googleSessionDriver = googleSessionDriver || new GoogleSessionDriver()
    this.openAiSessionDriver = openAiSessionDriver || new OpenAiSessionDriver()
  }

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

    if (account.provider === "google") {
      const generatedText = await this.googleSessionDriver.generate(account, modelId, prompt)
      await this.store.upsertAccount("google", account)
      return generatedText
    }

    if (account.provider === "openai") {
      const generatedText = await this.openAiSessionDriver.generate(account, modelId, prompt)
      await this.store.upsertAccount("openai", account)
      return generatedText
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
