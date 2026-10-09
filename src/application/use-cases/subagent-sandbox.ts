import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve, relative } from "node:path"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import { ConduitError } from "../ports/conduit-error.js"

const execAsync = promisify(exec)

export interface CommandExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
}

const SENSITIVE_ENV_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "DEEPSEEK_API_KEY",
  "GROQ_API_KEY",
]

export class SubagentSandbox {
  constructor(
    readonly worktreePath: string,
    readonly repoRoot: string = process.cwd(),
  ) {}

  async readFile(targetRelativePath: string): Promise<string> {
    try {
      const worktreeCandidate = this.assertConfinement(targetRelativePath, this.worktreePath)
      return await readFile(worktreeCandidate, "utf8")
    } catch {
      // Fallback: check if it's a repository-level file (e.g. AGENTS.md, skills) confined within repoRoot
      try {
        const repoCandidate = this.assertConfinement(targetRelativePath, this.repoRoot)
        return await readFile(repoCandidate, "utf8")
      } catch (error: unknown) {
        throw ConduitError.from(error, "invalid_input")
      }
    }
  }

  async writeFile(targetRelativePath: string, fileContent: string): Promise<void> {
    const resolvedPath = this.assertConfinement(targetRelativePath, this.worktreePath)
    try {
      await mkdir(dirname(resolvedPath), { recursive: true })
      await writeFile(resolvedPath, fileContent, "utf8")
    } catch (error: unknown) {
      throw ConduitError.from(error, "invalid_input")
    }
  }

  async editFile(targetRelativePath: string, oldSnippet: string, newSnippet: string): Promise<void> {
    const resolvedPath = this.assertConfinement(targetRelativePath, this.worktreePath)
    try {
      const existingContent = await readFile(resolvedPath, "utf8")
      if (!existingContent.includes(oldSnippet)) {
        throw new ConduitError("invalid_input", `Original text snippet was not found in ${targetRelativePath}.`)
      }
      const updatedContent = existingContent.replace(oldSnippet, newSnippet)
      await writeFile(resolvedPath, updatedContent, "utf8")
    } catch (error: unknown) {
      throw ConduitError.from(error, "invalid_input")
    }
  }

  async runCommand(commandString: string): Promise<CommandExecutionResult> {
    const sanitizedEnvironment = { ...process.env }
    for (const sensitiveVar of SENSITIVE_ENV_VARS) {
      delete sanitizedEnvironment[sensitiveVar]
    }

    try {
      const { stdout, stderr } = await execAsync(commandString, {
        cwd: this.worktreePath,
        timeout: 60_000,
        env: sanitizedEnvironment,
      })
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 }
    } catch (error: any) {
      return {
        stdout: error.stdout ? String(error.stdout).trim() : "",
        stderr: error.stderr ? String(error.stderr).trim() : error.message,
        exitCode: error.code || 1,
      }
    }
  }

  assertConfinement(targetRelativePath: string, rootBoundary: string = this.worktreePath): string {
    const resolvedTarget = resolve(rootBoundary, targetRelativePath)
    const normalizedRoot = resolve(rootBoundary)
    const relativeOffset = relative(normalizedRoot, resolvedTarget)

    if (
      relativeOffset.startsWith("..") ||
      relativeOffset === ".." ||
      resolve(normalizedRoot, relativeOffset) !== resolvedTarget
    ) {
      throw new ConduitError(
        "confinement_violation",
        `Path confinement violation: '${targetRelativePath}' attempts to access outside the authorized directory.`,
      )
    }
    return resolvedTarget
  }
}
