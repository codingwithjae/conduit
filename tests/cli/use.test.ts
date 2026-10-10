import { describe, expect, it, vi } from "vitest"
import { runCli } from "../../src/adapters/inbound/cli/program.js"
import type { PoolInferenceUseCase } from "../../src/application/use-cases/pool-inference.js"

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

describe("Conduit CLI use command", () => {
  it("executes prompt via pool inference use case", async () => {
    const mockUseCase = {
      execute: vi.fn(async () => ({
        provider: "openai",
        model: "gpt-6-luna",
        text: "Response from pool GPT-6 Luna",
        accountUsed: { id: "oa_1", email: "user@chatgpt.com", alias: "Personal Plus" },
      })),
    } as unknown as PoolInferenceUseCase

    const out = captureOutput()
    const exitCode = await runCli(["use", "gpt-6-luna", "Solve", "this", "bug"], {
      output: out.io,
      poolInferenceUseCase: mockUseCase,
    })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toBe("Response from pool GPT-6 Luna\n")
    expect(out.read().stderr).toContain("Model: openai/gpt-6-luna · Account: Personal Plus (user@chatgpt.com)")
    expect(mockUseCase.execute).toHaveBeenCalledWith({
      model: "gpt-6-luna",
      prompt: "Solve this bug",
      forceApiKey: false,
    })
  })

  it("passes forceApiKey when --api-key is specified", async () => {
    const mockUseCase = {
      execute: vi.fn(async () => ({
        provider: "google",
        model: "gemini-3.8-flash",
        text: "Official API response",
      })),
    } as unknown as PoolInferenceUseCase

    const out = captureOutput()
    const exitCode = await runCli(["use", "gemini-3.8-flash", "hello", "--api-key"], {
      output: out.io,
      poolInferenceUseCase: mockUseCase,
    })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toBe("Official API response\n")
    expect(mockUseCase.execute).toHaveBeenCalledWith({
      model: "gemini-3.8-flash",
      prompt: "hello",
      forceApiKey: true,
    })
  })

  it("reports account rotation notice in stderr when failover occurs", async () => {
    const mockUseCase = {
      execute: vi.fn(async () => ({
        provider: "google",
        model: "gemini-3.8-flash",
        text: "Success after rotation",
        accountUsed: { id: "g_2", email: "user2@gmail.com" },
        rotatedFromAccounts: ["user1@gmail.com"],
      })),
    } as unknown as PoolInferenceUseCase

    const out = captureOutput()
    const exitCode = await runCli(["use", "gemini-3.8-flash", "test"], {
      output: out.io,
      poolInferenceUseCase: mockUseCase,
    })

    expect(exitCode).toBe(0)
    expect(out.read().stderr).toContain("Rate limit reached on user1@gmail.com")
    expect(out.read().stderr).toContain("Retried successfully via: user2@gmail.com")
  })
})
