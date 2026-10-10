import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubagentToolLoop } from "../../src/application/use-cases/subagent-tool-loop.js"
import { GitWorktreeManager } from "../../src/adapters/outbound/git/git-worktree-manager.js"
import type { PoolInferenceUseCase } from "../../src/application/use-cases/pool-inference.js"

const execFileAsync = promisify(execFile)

describe("SubagentToolLoop", () => {
  let tempRepoDir: string
  let worktreeManager: GitWorktreeManager

  beforeEach(async () => {
    tempRepoDir = resolve(tmpdir(), `conduit-loop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(tempRepoDir, { recursive: true })

    await execFileAsync("git", ["init"], { cwd: tempRepoDir })
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tempRepoDir })
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: tempRepoDir })

    await writeFile(resolve(tempRepoDir, "base.txt"), "Base content\n", "utf8")
    await execFileAsync("git", ["add", "base.txt"], { cwd: tempRepoDir })
    await execFileAsync("git", ["commit", "-m", "Initial"], { cwd: tempRepoDir })

    worktreeManager = new GitWorktreeManager(tempRepoDir)
  })

  afterEach(async () => {
    await rm(tempRepoDir, { recursive: true, force: true }).catch(() => {})
  })

  it("executes multi-step tool loop, captures diff, and cleans up worktree", async () => {
    let callCount = 0
    const mockPoolInference = {
      execute: vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return {
            provider: "openai",
            model: "gpt-6-luna",
            text: '{"action": "write_file", "path": "feature.txt", "content": "Subagent created this\\n"}',
            accountUsed: { email: "plus@chatgpt.com" },
          }
        }
        return {
          provider: "openai",
          model: "gpt-6-luna",
          text: '{"action": "finish", "summary": "Feature successfully added."}',
          accountUsed: { email: "plus@chatgpt.com" },
        }
      }),
    } as unknown as PoolInferenceUseCase

    const loop = new SubagentToolLoop(worktreeManager, mockPoolInference)
    const result = await loop.executeTask({
      taskId: "task_1",
      model: "gpt-6-luna",
      taskDescription: "Create feature.txt",
      repoRoot: tempRepoDir,
    })

    expect(result.success).toBe(true)
    expect(result.stepsCompleted).toBe(2)
    expect(result.summary).toBe("Feature successfully added.")
    expect(result.modifiedFiles).toContain("feature.txt")
    expect(result.diff).toContain("+Subagent created this")
    expect(result.accountUsed).toBe("plus@chatgpt.com")
  })

  it("respects maxSteps bound and halts without infinite loop", async () => {
    const mockPoolInference = {
      execute: vi.fn(async () => ({
        provider: "google",
        model: "gemini-3.8-flash",
        text: '{"action": "run_command", "command": "echo looping"}',
        accountUsed: { email: "acc@gmail.com" },
      })),
    } as unknown as PoolInferenceUseCase

    const loop = new SubagentToolLoop(worktreeManager, mockPoolInference)
    const result = await loop.executeTask({
      taskId: "task_bound",
      model: "gemini-3.8-flash",
      taskDescription: "Looping task",
      maxSteps: 3,
      repoRoot: tempRepoDir,
    })

    expect(result.stepsCompleted).toBe(3)
    expect(result.summary).toContain("Maximum limit of 3 steps reached")
  })
})
