import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, writeFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GitWorktreeManager } from "../../src/adapters/outbound/git/git-worktree-manager.js"

const execFileAsync = promisify(execFile)

describe("GitWorktreeManager", () => {
  let tempRepoDir: string
  let manager: GitWorktreeManager

  beforeEach(async () => {
    tempRepoDir = resolve(tmpdir(), `conduit-git-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(tempRepoDir, { recursive: true })

    // Initialize clean git repository
    await execFileAsync("git", ["init"], { cwd: tempRepoDir })
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tempRepoDir })
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: tempRepoDir })

    // Initial commit
    await writeFile(resolve(tempRepoDir, "index.txt"), "Initial content\n", "utf8")
    await execFileAsync("git", ["add", "index.txt"], { cwd: tempRepoDir })
    await execFileAsync("git", ["commit", "-m", "Initial commit"], { cwd: tempRepoDir })

    manager = new GitWorktreeManager(tempRepoDir)
  })

  afterEach(async () => {
    await rm(tempRepoDir, { recursive: true, force: true }).catch(() => {})
  })

  it("provisions a worktree on an isolated branch, extracts diff, and cleans up", async () => {
    const context = await manager.createWorktree("task_abc")

    expect(context.branchName).toBe("conduit/task-task_abc")
    expect(context.worktreePath).toContain(".conduit/worktrees/task_abc")

    // Modify a file in the worktree
    await writeFile(resolve(context.worktreePath, "index.txt"), "Modified content by subagent\n", "utf8")
    // Add a new file in the worktree
    await writeFile(resolve(context.worktreePath, "new-file.txt"), "Brand new file\n", "utf8")

    // Check main repo file is untouched!
    const { stdout: mainContent } = await execFileAsync("git", ["show", "HEAD:index.txt"], { cwd: tempRepoDir })
    expect(mainContent).toBe("Initial content\n")

    // Extract diff from worktree
    const diffResult = await manager.getDiff(context.worktreePath)
    expect(diffResult.diff).toContain("+Modified content by subagent")
    expect(diffResult.diff).toContain("+Brand new file")
    expect(diffResult.modifiedFiles).toContain("index.txt")
    expect(diffResult.modifiedFiles).toContain("new-file.txt")

    // Cleanup worktree
    await manager.cleanupWorktree(context)

    // Check worktree directory is removed and branch is deleted
    const { stdout: branches } = await execFileAsync("git", ["branch"], { cwd: tempRepoDir })
    expect(branches).not.toContain("conduit/task-task_abc")
  })
})
