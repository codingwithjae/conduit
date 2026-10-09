import { mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SubagentSandbox } from "../../src/application/use-cases/subagent-sandbox.js"

describe("SubagentSandbox and Path Confinement", () => {
  let tempWorktreeDir: string
  let sandbox: SubagentSandbox

  beforeEach(async () => {
    tempWorktreeDir = resolve(tmpdir(), `conduit-sandbox-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(tempWorktreeDir, { recursive: true })
    sandbox = new SubagentSandbox(tempWorktreeDir)
  })

  afterEach(async () => {
    await rm(tempWorktreeDir, { recursive: true, force: true }).catch(() => {})
  })

  it("reads, writes, and edits files inside the worktree", async () => {
    await sandbox.writeFile("src/example.txt", "Initial hello world")
    const content = await sandbox.readFile("src/example.txt")
    expect(content).toBe("Initial hello world")

    await sandbox.editFile("src/example.txt", "hello", "brave new")
    const updated = await sandbox.readFile("src/example.txt")
    expect(updated).toBe("Initial brave new world")
  })

  it("blocks path traversal and writes outside the worktree", async () => {
    await expect(sandbox.writeFile("../outside.txt", "Escape attempt")).rejects.toMatchObject({
      code: "confinement_violation",
    })
    await expect(sandbox.writeFile("/tmp/absolute-outside.txt", "Direct escape")).rejects.toMatchObject({
      code: "confinement_violation",
    })
  })

  it("runs commands inside the worktree as cwd", async () => {
    const result = await sandbox.runCommand("pwd")
    expect(result.exitCode).toBe(0)
    const expectedCwd = await realpath(tempWorktreeDir)
    const actualCwd = await realpath(result.stdout)
    expect(actualCwd).toBe(expectedCwd)
  })
})
