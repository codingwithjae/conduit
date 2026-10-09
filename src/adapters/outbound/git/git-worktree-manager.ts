import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolve } from "node:path"
import { rm, mkdir } from "node:fs/promises"
import { ConduitError } from "../../../application/ports/conduit-error.js"

const execFileAsync = promisify(execFile)

export interface WorktreeContext {
  taskId: string
  worktreePath: string
  branchName: string
}

export interface WorktreeDiffResult {
  diff: string
  modifiedFiles: string[]
}

export class GitWorktreeManager {
  constructor(readonly repoRoot: string = process.cwd()) {}

  async createWorktree(taskId: string): Promise<WorktreeContext> {
    const sanitizedTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "")
    if (!sanitizedTaskId || sanitizedTaskId.startsWith("-")) {
      throw new ConduitError("invalid_input", "Task identifier must not be empty or start with a hyphen.")
    }

    const branchName = `conduit/task-${sanitizedTaskId}`
    const worktreePath = resolve(this.repoRoot, ".conduit/worktrees", sanitizedTaskId)

    try {
      await mkdir(resolve(this.repoRoot, ".conduit/worktrees"), { recursive: true })
      await execFileAsync("git", ["worktree", "add", "-b", branchName, worktreePath, "HEAD"], {
        cwd: this.repoRoot,
      })
      return { taskId: sanitizedTaskId, worktreePath, branchName }
    } catch (error: unknown) {
      throw ConduitError.from(error, "provider_unavailable")
    }
  }

  async getDiff(worktreePath: string): Promise<WorktreeDiffResult> {
    try {
      // Mark untracked files so they appear in git diff
      await execFileAsync("git", ["add", "-N", "."], { cwd: worktreePath }).catch(() => {})

      const diffOutput = await execFileAsync("git", ["diff", "HEAD"], { cwd: worktreePath })
      const filesOutput = await execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd: worktreePath })

      const modifiedFiles = filesOutput.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)

      return {
        diff: diffOutput.stdout.trim(),
        modifiedFiles,
      }
    } catch (error: unknown) {
      throw ConduitError.from(error, "invalid_response")
    }
  }

  async cleanupWorktree(context: WorktreeContext): Promise<void> {
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", context.worktreePath], {
        cwd: this.repoRoot,
      }).catch(() => {})

      await execFileAsync("git", ["branch", "-D", context.branchName], {
        cwd: this.repoRoot,
      }).catch(() => {})

      await execFileAsync("git", ["worktree", "prune"], {
        cwd: this.repoRoot,
      }).catch(() => {})

      await rm(context.worktreePath, { recursive: true, force: true }).catch(() => {})
    } catch {
      // Best-effort cleanup
    }
  }
}
