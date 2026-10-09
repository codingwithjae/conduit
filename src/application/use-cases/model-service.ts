import { ConduitError, type ConduitErrorCode } from "../ports/conduit-error.js"
import { providerIds, type ModelProvider, type ProviderId, type ProviderModel } from "../ports/model-provider.js"

export const MODEL_CATALOG_TTL_MS = 5 * 60 * 1000

export interface ProviderStatus {
  provider: ProviderId
  configured: boolean
  credentialSource: string | null
}

export interface ModelCatalog {
  provider: ProviderId
  fetchedAt: string
  cacheAgeSeconds: number
  cacheTtlSeconds: number
  models: ProviderModel[]
}

export interface DelegateTaskInput {
  provider: ProviderId
  model: string
  prompt: string
  confirmExternalSend?: boolean | undefined
}

export interface DelegatedResponse {
  provider: ProviderId
  model: string
  text: string
}

interface CacheEntry {
  fetchedAtMs: number
  models: ProviderModel[]
}

export class ModelService {
  private readonly providers = new Map<ProviderId, ModelProvider>()
  private readonly catalogCache = new Map<ProviderId, CacheEntry>()

  constructor(
    providers: readonly ModelProvider[],
    private readonly now: () => number = Date.now,
  ) {
    for (const provider of providers) this.providers.set(provider.id, provider)
  }

  getProviderStatus(): ProviderStatus[] {
    return providerIds.map((providerId) => {
      const provider = this.providers.get(providerId)
      return {
        provider: providerId,
        configured: Boolean(provider?.credentialSource),
        credentialSource: provider?.credentialSource ?? null,
      }
    })
  }

  async listModels(providerId: ProviderId): Promise<ModelCatalog> {
    const provider = this.getProvider(providerId)
    this.requireCredentials(provider)

    const cached = this.catalogCache.get(providerId)
    const now = this.now()
    if (cached && now - cached.fetchedAtMs < MODEL_CATALOG_TTL_MS) {
      return this.toCatalog(providerId, cached, now)
    }

    const models = await provider.listModels()
    const entry = { fetchedAtMs: this.now(), models }
    this.catalogCache.set(providerId, entry)
    return this.toCatalog(providerId, entry, entry.fetchedAtMs)
  }

  async delegateTask(input: DelegateTaskInput): Promise<DelegatedResponse> {
    if (input.confirmExternalSend !== true) {
      throw new ConduitError("consent_required", "Confirm sending prompt to provider with confirmExternalSend: true.")
    }
    if (!input.prompt.trim() || input.prompt.length > 100_000) {
      throw new ConduitError("invalid_input", "Prompt must contain between 1 and 100,000 characters.")
    }

    const provider = this.getProvider(input.provider)
    this.requireCredentials(provider)

    const catalog = await this.listModels(input.provider)
    if (!catalog.models.some((model) => model.id === input.model)) {
      throw new ConduitError("unknown_model", "Model does not appear in the provider's recent catalog.")
    }

    return {
      provider: input.provider,
      model: input.model,
      text: await provider.generate(input.model, input.prompt),
    }
  }

  private getProvider(providerId: ProviderId): ModelProvider {
    const provider = this.providers.get(providerId)
    if (!provider) throw new ConduitError("unknown_provider", `Unsupported provider: ${providerId}.`)
    return provider
  }

  private requireCredentials(provider: ModelProvider): void {
    if (!provider.credentialSource) {
      throw new ConduitError("missing_credentials", `Configure an API key or base URL for ${provider.id} in server environment.`)
    }
  }

  private toCatalog(provider: ProviderId, entry: CacheEntry, now: number): ModelCatalog {
    return {
      provider,
      fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
      cacheAgeSeconds: Math.max(0, Math.floor((now - entry.fetchedAtMs) / 1000)),
      cacheTtlSeconds: MODEL_CATALOG_TTL_MS / 1000,
      models: entry.models,
    }
  }
}

export const isConduitError = (error: unknown): error is ConduitError => error instanceof ConduitError

export const safeToolError = (error: unknown): { code: ConduitErrorCode; message: string } => {
  if (isConduitError(error)) return { code: error.code, message: error.message }
  return { code: "provider_unavailable", message: "Unable to complete request to provider." }
}
