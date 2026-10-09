import { describe, expect, it, vi } from "vitest"
import { ConduitError } from "../../src/application/ports/conduit-error.js"
import type { ModelProvider } from "../../src/application/ports/model-provider.js"
import { MODEL_CATALOG_TTL_MS, ModelService } from "../../src/application/use-cases/model-service.js"

const model = { id: "gpt-test", provider: "openai" as const, generationSupport: "unknown" as const }

const createProvider = (overrides: Partial<ModelProvider> = {}): ModelProvider => ({
  id: "openai",
  credentialSource: "OPENAI_API_KEY",
  listModels: vi.fn(async () => [model]),
  generate: vi.fn(async (_modelId: string, prompt: string) => `answer: ${prompt}`),
  ...overrides,
})

describe("ModelService", () => {
  it("reports configured providers without their key values", () => {
    const service = new ModelService([createProvider()])
    const status = service.getProviderStatus()

    expect(status).toEqual([
      { provider: "openai", configured: true, credentialSource: "OPENAI_API_KEY" },
      { provider: "google", configured: false, credentialSource: null },
      { provider: "anthropic", configured: false, credentialSource: null },
      { provider: "openrouter", configured: false, credentialSource: null },
      { provider: "deepseek", configured: false, credentialSource: null },
      { provider: "groq", configured: false, credentialSource: null },
      { provider: "ollama", configured: false, credentialSource: null },
    ])
    expect(JSON.stringify(status)).not.toContain("secret")
  })

  it("caches a provider catalog for five minutes and reports its age", async () => {
    let now = 1_800_000_000_000
    const provider = createProvider()
    const service = new ModelService([provider], () => now)

    const first = await service.listModels("openai")
    now += 90_000
    const second = await service.listModels("openai")

    expect(provider.listModels).toHaveBeenCalledTimes(1)
    expect(first.cacheTtlSeconds).toBe(MODEL_CATALOG_TTL_MS / 1000)
    expect(second.cacheAgeSeconds).toBe(90)
  })

  it("refreshes an expired catalog instead of returning stale entries", async () => {
    let now = 1_800_000_000_000
    const provider = createProvider()
    const service = new ModelService([provider], () => now)
    await service.listModels("openai")
    now += MODEL_CATALOG_TTL_MS + 1
    vi.mocked(provider.listModels).mockRejectedValueOnce(
      new ConduitError("provider_unavailable", "Proveedor no disponible."),
    )

    await expect(service.listModels("openai")).rejects.toMatchObject({ code: "provider_unavailable" })
    expect(provider.listModels).toHaveBeenCalledTimes(2)
  })

  it("requires explicit consent before making provider requests", async () => {
    const provider = createProvider()
    const service = new ModelService([provider])

    await expect(service.delegateTask({ provider: "openai", model: model.id, prompt: "hello" }))
      .rejects.toMatchObject({ code: "consent_required" })
    expect(provider.listModels).not.toHaveBeenCalled()
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it("does not call an unconfigured provider", async () => {
    const provider = createProvider({ credentialSource: null })
    const service = new ModelService([provider])

    await expect(service.listModels("openai")).rejects.toMatchObject({ code: "missing_credentials" })
    expect(provider.listModels).not.toHaveBeenCalled()
  })

  it("rejects a model that was not in the current provider catalog", async () => {
    const provider = createProvider()
    const service = new ModelService([provider])

    await expect(service.delegateTask({
      provider: "openai",
      model: "gpt-unlisted",
      prompt: "hello",
      confirmExternalSend: true,
    })).rejects.toMatchObject({ code: "unknown_model" })
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it("passes only the caller prompt to the selected provider", async () => {
    const provider = createProvider()
    const service = new ModelService([provider])
    const prompt = "Check this text exactly as supplied."

    const result = await service.delegateTask({
      provider: "openai",
      model: model.id,
      prompt,
      confirmExternalSend: true,
    })

    expect(provider.generate).toHaveBeenCalledWith(model.id, prompt)
    expect(result).toEqual({ provider: "openai", model: model.id, text: `answer: ${prompt}` })
  })

  it("rejects empty and oversized prompts before contacting a provider", async () => {
    const provider = createProvider()
    const service = new ModelService([provider])

    await expect(service.delegateTask({
      provider: "openai",
      model: model.id,
      prompt: "   ",
      confirmExternalSend: true,
    })).rejects.toMatchObject({ code: "invalid_input" })
    await expect(service.delegateTask({
      provider: "openai",
      model: model.id,
      prompt: "x".repeat(100_001),
      confirmExternalSend: true,
    })).rejects.toMatchObject({ code: "invalid_input" })
    expect(provider.listModels).not.toHaveBeenCalled()
  })
})
