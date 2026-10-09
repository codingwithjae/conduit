import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { writeFile, unlink } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { ConduitError } from "../../src/application/ports/conduit-error.js"
import { FileAccountStore } from "../../src/adapters/outbound/storage/file-account-store.js"

describe("ConduitError mapping and data protection", () => {
  it("preserves existing ConduitError instances", () => {
    const original = new ConduitError("consent_required", "Explicit consent required")
    const mapped = ConduitError.from(original)
    expect(mapped).toBe(original)
    expect(mapped.code).toBe("consent_required")
  })

  it("maps git repository errors to not_a_git_repository", () => {
    const gitError = new Error("fatal: not a git repository (or any of the parent directories): .git")
    const mapped = ConduitError.from(gitError)
    expect(mapped.code).toBe("not_a_git_repository")
    expect(mapped.message).toContain("not a Git repository")
  })

  it("maps ECONNREFUSED network errors to service_offline", () => {
    const refusedError = new Error("fetch failed: connect ECONNREFUSED 127.0.0.1:11434")
    const mapped = ConduitError.from(refusedError)
    expect(mapped.code).toBe("service_offline")
    expect(mapped.message).toContain("Verify that the local service")
  })

  it("maps context window exhaustion to context_length_exceeded", () => {
    const contextError = new Error("BadRequestError: This model's maximum context length is 128000 tokens")
    const mapped = ConduitError.from(contextError)
    expect(mapped.code).toBe("context_length_exceeded")
    expect(mapped.message).toContain("maximum context length")
  })

  it("maps timeout errors to provider_unavailable", () => {
    const timeoutError = new Error("AbortError: The operation was aborted due to timeout")
    const mapped = ConduitError.from(timeoutError)
    expect(mapped.code).toBe("provider_unavailable")
    expect(mapped.message).toContain("timed out")
  })

  it("protects pools.json by throwing storage_corrupted without overwriting corrupted files", async () => {
    const corruptedFilePath = resolve(tmpdir(), `corrupted-pools-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
    await writeFile(corruptedFilePath, "{ this is not valid JSON content !!! }", "utf8")

    const store = new FileAccountStore(corruptedFilePath)

    try {
      await expect(store.load()).rejects.toMatchObject({
        code: "storage_corrupted",
      })

      // Ensure corrupted file was NOT overwritten with empty state!
      const contentAfterAttempt = await (await import("node:fs/promises")).readFile(corruptedFilePath, "utf8")
      expect(contentAfterAttempt).toBe("{ this is not valid JSON content !!! }")
    } finally {
      await unlink(corruptedFilePath).catch(() => {})
    }
  })
})
