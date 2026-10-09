import { describe, expect, it } from "vitest"
import { createEmptyPool, createInitialPoolsState } from "../../src/domain/pool/account-pool.js"
import { providerIds } from "../../src/application/ports/model-provider.js"
import type { Account } from "../../src/domain/pool/account.js"

describe("AccountPool domain", () => {
  it("creates an empty pool with correct provider and activeIndex 0", () => {
    const pool = createEmptyPool("openai")
    expect(pool.provider).toBe("openai")
    expect(pool.activeIndex).toBe(0)
    expect(pool.accounts).toEqual([])
  })

  it("initializes PoolsState with all supported providers", () => {
    const state = createInitialPoolsState()
    expect(state.version).toBe(1)
    expect(typeof state.updatedAt).toBe("string")
    for (const provider of providerIds) {
      expect(state.pools[provider]).toBeDefined()
      expect(state.pools[provider].provider).toBe(provider)
      expect(state.pools[provider].accounts).toEqual([])
    }
  })

  it("validates an Account model structure", () => {
    const account: Account = {
      id: "acc_1",
      provider: "google",
      email: "test@example.com",
      alias: "Test Account",
      tier: "g1-pro",
      tokens: { refresh: "1//test-refresh-token" },
      importedFrom: "antigravity",
      addedAt: Date.now(),
    }
    expect(account.id).toBe("acc_1")
    expect(account.provider).toBe("google")
    expect(account.tokens.refresh).toBe("1//test-refresh-token")
  })
})
