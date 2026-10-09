import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { unlink } from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PoolInferenceUseCase } from "../../src/application/use-cases/pool-inference.js"
import { FileAccountStore } from "../../src/adapters/outbound/storage/file-account-store.js"
import { ModelService } from "../../src/application/use-cases/model-service.js"
import { ConduitError } from "../../src/application/ports/conduit-error.js"

describe("PoolInferenceUseCase and Auto-Failover", () => {
  let testFile: string
  let store: FileAccountStore
  let mockModelService: ModelService

  beforeEach(() => {
    testFile = resolve(tmpdir(), `conduit-failover-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    store = new FileAccountStore(testFile)
    mockModelService = {
      delegateTask: vi.fn(async ({ provider, model }) => ({
        provider,
        model,
        text: "Official API key response",
      })),
      listModels: vi.fn(async () => ({ models: [] })),
      getProviderStatus: vi.fn(() => []),
    } as unknown as ModelService
  })

  afterEach(async () => {
    await unlink(testFile).catch(() => {})
  })

  it("executes prompt using active pool account", async () => {
    await store.upsertAccount("openai", {
      id: "acc_1",
      provider: "openai",
      email: "user1@chatgpt.com",
      tokens: { refresh: "rt1" },
    })

    const invoker = vi.fn(async () => "Pool response text")
    const useCase = new PoolInferenceUseCase(store, mockModelService, invoker)

    const result = await useCase.execute({
      model: "gpt-4o",
      prompt: "Hello pool",
    })

    expect(result.text).toBe("Pool response text")
    expect(result.accountUsed?.email).toBe("user1@chatgpt.com")
    expect(invoker).toHaveBeenCalledTimes(1)
  })

  it("forces official API key when forceApiKey is true", async () => {
    await store.upsertAccount("openai", {
      id: "acc_1",
      provider: "openai",
      email: "user1@chatgpt.com",
      tokens: { refresh: "rt1" },
    })

    const invoker = vi.fn(async () => "Pool response")
    const useCase = new PoolInferenceUseCase(store, mockModelService, invoker)

    const result = await useCase.execute({
      model: "openai/gpt-4o",
      prompt: "Hello API",
      forceApiKey: true,
    })

    expect(result.text).toBe("Official API key response")
    expect(invoker).not.toHaveBeenCalled()
    expect(mockModelService.delegateTask).toHaveBeenCalledTimes(1)
  })

  it("transparently rotates and retries when active account returns 429", async () => {
    await store.upsertAccount("google", {
      id: "g_1",
      provider: "google",
      email: "acc1@gmail.com",
      tokens: { refresh: "rt1" },
    })
    await store.upsertAccount("google", {
      id: "g_2",
      provider: "google",
      email: "acc2@gmail.com",
      tokens: { refresh: "rt2" },
    })

    // Account 1 throws 429, Account 2 succeeds
    const invoker = vi.fn(async (account) => {
      if (account.email === "acc1@gmail.com") {
        throw new ConduitError("rate_limited", "Quota exhausted for acc1")
      }
      return "Success from acc2"
    })

    const useCase = new PoolInferenceUseCase(store, mockModelService, invoker)
    const result = await useCase.execute({
      model: "gemini-2.5-pro",
      prompt: "Execute task",
    })

    expect(result.text).toBe("Success from acc2")
    expect(result.accountUsed?.email).toBe("acc2@gmail.com")
    expect(result.rotatedFromAccounts).toEqual(["acc1@gmail.com"])
    expect(invoker).toHaveBeenCalledTimes(2)

    // Store has been updated so Account 2 is now active for next runs
    const pool = await store.getPool("google")
    expect(pool.activeIndex).toBe(1)
  })

  it("throws rate_limited when all accounts in the pool return 429", async () => {
    await store.upsertAccount("google", {
      id: "g_1",
      provider: "google",
      email: "acc1@gmail.com",
      tokens: { refresh: "rt1" },
    })
    await store.upsertAccount("google", {
      id: "g_2",
      provider: "google",
      email: "acc2@gmail.com",
      tokens: { refresh: "rt2" },
    })

    // Both fail with 429
    const invoker = vi.fn(async () => {
      throw new ConduitError("rate_limited", "Quota exhausted")
    })

    const useCase = new PoolInferenceUseCase(store, mockModelService, invoker)

    await expect(
      useCase.execute({
        model: "gemini-2.5-flash",
        prompt: "Execute task",
      }),
    ).rejects.toMatchObject({
      code: "rate_limited",
    })

    expect(invoker).toHaveBeenCalledTimes(2) // Attempted each account once, no infinite loop!
  })

  it("does not rotate accounts when error is not rate_limited", async () => {
    await store.upsertAccount("openai", {
      id: "oa_1",
      provider: "openai",
      email: "acc1@chatgpt.com",
      tokens: { refresh: "rt1" },
    })
    await store.upsertAccount("openai", {
      id: "oa_2",
      provider: "openai",
      email: "acc2@chatgpt.com",
      tokens: { refresh: "rt2" },
    })

    // Fails with provider_rejected (e.g. invalid request)
    const invoker = vi.fn(async () => {
      throw new ConduitError("provider_rejected", "Invalid request parameter")
    })

    const useCase = new PoolInferenceUseCase(store, mockModelService, invoker)

    await expect(
      useCase.execute({
        model: "gpt-4o",
        prompt: "Bad request",
      }),
    ).rejects.toMatchObject({
      code: "provider_rejected",
    })

    expect(invoker).toHaveBeenCalledTimes(1) // Did not rotate!
  })
})
