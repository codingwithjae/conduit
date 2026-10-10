import { describe, expect, it, vi } from "vitest"
import { runCli } from "../../src/adapters/inbound/cli/program.js"
import type { SubagentToolLoop } from "../../src/application/use-cases/subagent-tool-loop.js"

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

describe("Conduit CLI dispatch command", () => {
  it("executes subagent task and writes git diff to stdout", async () => {
    const mockLoop = {
      executeTask: vi.fn(async ({ model, taskDescription, maxSteps }) => ({
        taskId: "task_1",
        success: true,
        diff: "diff --git a/file.txt b/file.txt\n+new line\n",
        summary: "Created new feature file.",
        modifiedFiles: ["file.txt"],
        stepsCompleted: 3,
        accountUsed: "user@chatgpt.com",
      })),
    } as unknown as SubagentToolLoop

    const out = captureOutput()
    const exitCode = await runCli(["dispatch", "gpt-6-luna", "Create", "feature"], {
      output: out.io,
      subagentLoop: mockLoop,
    })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("diff --git a/file.txt b/file.txt")
    expect(out.read().stderr).toContain("Provisioning isolated Git Worktree for subagent (gpt-6-luna)")
    expect(out.read().stderr).toContain("Created new feature file. (Steps completed: 3)")
    expect(out.read().stderr).toContain("Modified files: file.txt")
    expect(mockLoop.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-6-luna",
        taskDescription: "Create feature",
        maxSteps: 15,
      }),
    )
  })

  it("passes custom --max-steps to subagent loop", async () => {
    const mockLoop = {
      executeTask: vi.fn(async () => ({
        taskId: "task_2",
        success: true,
        diff: "",
        summary: "No changes",
        modifiedFiles: [],
        stepsCompleted: 5,
      })),
    } as unknown as SubagentToolLoop

    const out = captureOutput()
    const exitCode = await runCli(["dispatch", "gemini-3.8-flash", "Quick", "fix", "--max-steps", "5"], {
      output: out.io,
      subagentLoop: mockLoop,
    })

    expect(exitCode).toBe(0)
    expect(out.read().stdout).toContain("(No changes generated in repository)")
    expect(mockLoop.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSteps: 5,
      }),
    )
  })
})
