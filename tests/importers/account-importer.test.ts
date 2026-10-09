import { writeFile, unlink, mkdir, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AntigravityImporter } from "../../src/adapters/outbound/importers/antigravity-importer.js"
import { CodexImporter } from "../../src/adapters/outbound/importers/codex-importer.js"
import { ClaudeCodeImporter } from "../../src/adapters/outbound/importers/claude-code-importer.js"
import { ImportAccountsUseCase } from "../../src/application/use-cases/import-accounts.js"
import { FileAccountStore } from "../../src/adapters/outbound/storage/file-account-store.js"

describe("Universal Account Importers", () => {
  let tempDir: string
  let agFile: string
  let codexPoolFile: string
  let codexAuthFile: string
  let claudeConfigFile: string
  let claudeAuthFile: string
  let storeFile: string
  let store: FileAccountStore

  beforeEach(async () => {
    tempDir = resolve(tmpdir(), `conduit-importer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(tempDir, { recursive: true })

    agFile = resolve(tempDir, "antigravity.json")
    codexPoolFile = resolve(tempDir, "codex-pool.json")
    codexAuthFile = resolve(tempDir, "codex-auth.json")
    claudeConfigFile = resolve(tempDir, "claude-config.json")
    claudeAuthFile = resolve(tempDir, "claude-auth.json")
    storeFile = resolve(tempDir, "store.json")
    store = new FileAccountStore(storeFile)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  it("imports Google accounts from Antigravity mock file", async () => {
    await writeFile(
      agFile,
      JSON.stringify({
        accounts: [
          {
            email: "johander@gmail.com",
            label: "Personal Account",
            refreshToken: "1//test-refresh-1|aicode-consumers",
            capturedPaidTierId: "g1-pro-tier",
            enabled: true,
          },
          {
            email: "disabled@gmail.com",
            refreshToken: "1//disabled-refresh",
            enabled: false,
          },
        ],
      }),
    )

    const importer = new AntigravityImporter(agFile)
    expect(await importer.isAvailable()).toBe(true)

    const discovered = await importer.discover()
    expect(discovered.length).toBe(1)
    expect(discovered[0]!.email).toBe("johander@gmail.com")
    expect(discovered[0]!.alias).toBe("Personal Account")
    expect(discovered[0]!.tokens.refresh).toBe("1//test-refresh-1")
    expect(discovered[0]!.provider).toBe("google")
  })

  it("imports OpenAI accounts from Codex pool and auth files", async () => {
    await writeFile(
      codexPoolFile,
      JSON.stringify({
        accounts: [
          {
            email: "plus@chatgpt.com",
            refresh: "rt_openai_1",
            access: "acc_1",
            expires: Date.now() + 3600000,
            alias: "Work ChatGPT",
          },
        ],
      }),
    )

    const importer = new CodexImporter(codexPoolFile, codexAuthFile)
    expect(await importer.isAvailable()).toBe(true)

    const discovered = await importer.discover()
    expect(discovered.length).toBe(1)
    expect(discovered[0]!.email).toBe("plus@chatgpt.com")
    expect(discovered[0]!.alias).toBe("Work ChatGPT")
    expect(discovered[0]!.tokens.refresh).toBe("rt_openai_1")
    expect(discovered[0]!.provider).toBe("openai")
  })

  it("imports Anthropic accounts from Claude Code config and auth files", async () => {
    await writeFile(
      claudeConfigFile,
      JSON.stringify({
        accounts: [
          {
            id: "fallback_1",
            email: "pro@anthropic.com",
            refresh: "sk-ant-ort1",
            label: "Pro Account",
          },
        ],
      }),
    )
    await writeFile(
      claudeAuthFile,
      JSON.stringify({
        anthropic: {
          type: "oauth",
          email: "main@anthropic.com",
          refresh: "sk-ant-ort_main",
        },
      }),
    )

    const importer = new ClaudeCodeImporter(claudeConfigFile, claudeAuthFile)
    expect(await importer.isAvailable()).toBe(true)

    const discovered = await importer.discover()
    expect(discovered.length).toBe(2)
    expect(discovered.map((a) => a.email)).toContain("pro@anthropic.com")
    expect(discovered.map((a) => a.email)).toContain("main@anthropic.com")
  })

  it("runs ImportAccountsUseCase and deduplicates accounts in FileAccountStore", async () => {
    await writeFile(
      agFile,
      JSON.stringify({
        accounts: [
          {
            email: "johander@gmail.com",
            label: "Personal",
            refreshToken: "1//refresh-token",
          },
        ],
      }),
    )

    const agImporter = new AntigravityImporter(agFile)
    const useCase = new ImportAccountsUseCase(store, [agImporter])

    // First import
    const report1 = await useCase.importAll()
    expect(report1.totalDiscovered).toBe(1)
    expect(report1.importedAccounts.length).toBe(1)

    // Second import with updated alias
    await writeFile(
      agFile,
      JSON.stringify({
        accounts: [
          {
            email: "johander@gmail.com",
            label: "Personal Updated",
            refreshToken: "1//refresh-token",
          },
        ],
      }),
    )

    const report2 = await useCase.importAll()
    expect(report2.totalDiscovered).toBe(1)

    const pool = await store.getPool("google")
    expect(pool.accounts.length).toBe(1) // Not duplicated!
    expect(pool.accounts[0]!.alias).toBe("Personal Updated")
  })
})
