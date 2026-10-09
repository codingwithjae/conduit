import { describe, expect, it } from "vitest"
import { runCli } from "../src/adapters/inbound/cli/program.js"

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

describe("Conduit CLI", () => {
  it("prints the configured package version", async () => {
    const output = captureOutput()
    const exitCode = await runCli(["--version"], output.io)

    expect(exitCode).toBe(0)
    expect(output.read().stdout).toMatch(/^\d+\.\d+\.\d+\n$/)
    expect(output.read().stderr).toBe("")
  })

  it("supports the short version flag", async () => {
    const output = captureOutput()
    const exitCode = await runCli(["-v"], output.io)

    expect(exitCode).toBe(0)
    expect(output.read().stdout).toMatch(/^\d+\.\d+\.\d+\n$/)
  })

  it.each([
    { args: ["--help"] },
    { args: ["-h"] },
    { args: [] },
  ])("prints help for arguments $args", async ({ args }) => {
    const output = captureOutput()
    const exitCode = await runCli(args, output.io)

    expect(exitCode).toBe(0)
    expect(output.read().stdout).toContain("Usage: conduit")
    expect(output.read().stdout).toContain("Options:")
    expect(output.read().stderr).toBe("")
  })

  it("rejects unknown commands and points to help", async () => {
    const output = captureOutput()
    const exitCode = await runCli(["not-a-command"], output.io)

    expect(exitCode).toBe(1)
    expect(output.read().stderr).toContain("unknown command")
    expect(output.read().stderr).toContain("conduit --help")
  })

  it("rejects unknown options", async () => {
    const output = captureOutput()
    const exitCode = await runCli(["--not-a-real-option"], output.io)

    expect(exitCode).toBe(1)
    expect(output.read().stderr).toContain("unknown option")
  })
})
