import { stat, unlink, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FileAccountStore } from "../../src/adapters/outbound/storage/file-account-store.js"

describe("FileAccountStore", () => {
  let testFile: string
  let store: FileAccountStore

  beforeEach(() => {
    testFile = resolve(tmpdir(), `conduit-pools-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    store = new FileAccountStore(testFile)
  })

  afterEach(async () => {
    await unlink(testFile).catch(() => {})
  })

  it("creates initial state with 0600 file permissions", async () => {
    const state = await store.load()
    expect(state.version).toBe(1)
    expect(state.pools.google.accounts).toEqual([])

    const fileStat = await stat(testFile)
    const fileMode = fileStat.mode & 0o777
    expect(fileMode).toBe(0o600)
  })

  it("upserts accounts and sets activeIndex 0 for the first account", async () => {
    const account = await store.upsertAccount("google", {
      id: "acc_g1",
      provider: "google",
      email: "user1@gmail.com",
      tokens: { refresh: "refresh-1" },
    })

    expect(account.id).toBe("acc_g1")
    expect(account.email).toBe("user1@gmail.com")

    const pool = await store.getPool("google")
    expect(pool.accounts.length).toBe(1)
    expect(pool.activeIndex).toBe(0)

    const active = await store.getActiveAccount("google")
    expect(active?.id).toBe("acc_g1")
  })

  it("switches active account by 1-based index, id or alias", async () => {
    await store.upsertAccount("openai", {
      id: "acc_oa1",
      provider: "openai",
      email: "first@example.com",
      tokens: { refresh: "rt1" },
    })
    await store.upsertAccount("openai", {
      id: "acc_oa2",
      provider: "openai",
      email: "second@example.com",
      tokens: { refresh: "rt2" },
      alias: "Work Account",
    })

    // Switch by 1-based number (account 2)
    const switched = await store.switchActive("openai", 2)
    expect(switched.id).toBe("acc_oa2")
    expect((await store.getPool("openai")).activeIndex).toBe(1)

    // Switch by alias
    const byAlias = await store.switchActive("openai", "Work Account")
    expect(byAlias.id).toBe("acc_oa2")

    // Switch by id
    const byId = await store.switchActive("openai", "acc_oa1")
    expect(byId.id).toBe("acc_oa1")
    expect((await store.getPool("openai")).activeIndex).toBe(0)
  })

  it("sets and clears account aliases", async () => {
    await store.upsertAccount("google", {
      id: "acc_g1",
      provider: "google",
      email: "personal@gmail.com",
      tokens: { refresh: "rt1" },
    })

    const withAlias = await store.setAlias("google", 1, "Personal Pro")
    expect(withAlias.alias).toBe("Personal Pro")

    const cleared = await store.setAlias("google", 1, "clear")
    expect(cleared.alias).toBeUndefined()
  })

  it("preserves 0600 mode after multiple updates", async () => {
    await store.upsertAccount("google", {
      id: "acc_1",
      provider: "google",
      email: "test@example.com",
      tokens: { refresh: "rt" },
    })
    await store.setAlias("google", 1, "My Alias")

    const fileStat = await stat(testFile)
    expect(fileStat.mode & 0o777).toBe(0o600)
  })
})
