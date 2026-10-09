import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { unlink } from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runCli } from "../../src/adapters/inbound/cli/program.js"
import { FileAccountStore } from "../../src/adapters/outbound/storage/file-account-store.js"

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

describe("Conduit CLI account TUI integration", () => {
  let testFile: string
  let store: FileAccountStore

  beforeEach(() => {
    testFile = resolve(tmpdir(), `conduit-tui-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    store = new FileAccountStore(testFile)
  })

  afterEach(async () => {
    await unlink(testFile).catch(() => {})
  })

  it("falls back to plain text list when conduit account is run in non-TTY", async () => {
    await store.upsertAccount("google", {
      id: "g_1",
      provider: "google",
      email: "test@gmail.com",
      tokens: { refresh: "rt" },
    })

    const out = captureOutput()
    const exitCode = await runCli(["account"], { output: out.io, store })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("CONDUIT ACCOUNT POOLS")
    expect(out.read().stdout).toContain("GOOGLE")
    expect(out.read().stdout).toContain("test@gmail.com (active)")
  })
})
