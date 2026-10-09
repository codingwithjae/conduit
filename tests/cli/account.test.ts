import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { unlink } from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runCli } from "../../src/adapters/inbound/cli/program.js"
import { FileAccountStore } from "../../src/adapters/outbound/storage/file-account-store.js"
import type { AccountImporterPort } from "../../src/application/ports/account-importer.js"

const captureOutput = () => {
  let stdout = ""
  let stderr = ""
  return {
    io: {
      stdout: { write: (chunk: string) => { stdout += chunk; return true } },
      stderr: { write: (chunk: string) => { stderr += chunk; return true } },
    },
    read: () => ({ stdout, stderr }),
  }
}

describe("Conduit CLI account and quota commands", () => {
  let testFile: string
  let store: FileAccountStore

  beforeEach(() => {
    testFile = resolve(tmpdir(), `conduit-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    store = new FileAccountStore(testFile)
  })

  afterEach(async () => {
    await unlink(testFile).catch(() => {})
  })

  it("handles account list when pool is empty", async () => {
    const out = captureOutput()
    const exitCode = await runCli(["account", "list"], { output: out.io, store })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("No accounts configured")
  })

  it("lists accounts and displays active indicator", async () => {
    await store.upsertAccount("google", {
      id: "acc_1",
      provider: "google",
      email: "first@gmail.com",
      alias: "Personal",
      tier: "pro",
      tokens: { refresh: "rt-1" },
    })

    const out = captureOutput()
    const exitCode = await runCli(["account", "list"], { output: out.io, store })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("GOOGLE")
    expect(out.read().stdout).toContain("Personal (first@gmail.com) · pro (active)")
    expect(out.read().stdout).not.toContain("rt-1") // Secrets never shown!
  })

  it("switches active account via CLI", async () => {
    await store.upsertAccount("openai", {
      id: "oa_1",
      provider: "openai",
      email: "one@example.com",
      tokens: { refresh: "rt-1" },
    })
    await store.upsertAccount("openai", {
      id: "oa_2",
      provider: "openai",
      email: "two@example.com",
      tokens: { refresh: "rt-2" },
    })

    const out = captureOutput()
    const exitCode = await runCli(["account", "switch", "openai", "2"], { output: out.io, store })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("Active account for openai switched to: two@example.com")
    expect((await store.getPool("openai")).activeIndex).toBe(1)
  })

  it("updates and clears alias via CLI", async () => {
    await store.upsertAccount("google", {
      id: "g_1",
      provider: "google",
      email: "user@gmail.com",
      tokens: { refresh: "rt" },
    })

    const out = captureOutput()
    const code1 = await runCli(["account", "alias", "google", "1", "Trabajo"], { output: out.io, store })
    expect(code1).toBe(0)
    expect(out.read().stdout).toContain("Alias updated for user@gmail.com: Trabajo")

    const out2 = captureOutput()
    const code2 = await runCli(["account", "alias", "google", "1", "clear"], { output: out2.io, store })
    expect(code2).toBe(0)
    expect(out2.read().stdout).toContain("Alias updated for user@gmail.com: (none)")
  })

  it("executes account import with mock importers", async () => {
    const mockImporter: AccountImporterPort = {
      id: "mock",
      displayName: "Mock Source",
      isAvailable: async () => true,
      discover: async () => [
        {
          id: "mock_1",
          provider: "anthropic",
          email: "claude@test.com",
          tokens: { refresh: "rt-claude" },
          importedFrom: "claude-code",
          sourceName: "Mock Source",
        },
      ],
    }

    const out = captureOutput()
    const exitCode = await runCli(["account", "import"], {
      output: out.io,
      store,
      importers: [mockImporter],
    })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("Total accounts imported/updated: 1")
    expect((await store.getPool("anthropic")).accounts.length).toBe(1)
  })

  it("displays quota dashboard in plain text mode with real snapshot", async () => {
    await store.upsertAccount("google", {
      id: "g_1",
      provider: "google",
      email: "user@gmail.com",
      tokens: { refresh: "rt" },
      quotaSnapshot: {
        updatedAt: new Date().toISOString(),
        windows: [{ window: "Gem/5h", remainingPercent: 85, resetSeconds: 3600 }],
      },
    })

    const out = captureOutput()
    const exitCode = await runCli(["quota", "--text"], { output: out.io, store })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("CONDUIT QUOTA DASHBOARD")
    expect(out.read().stdout).toContain("GOOGLE")
    expect(out.read().stdout).toContain("[█████████░] 85% · resets in 1h 0m")
  })
})
