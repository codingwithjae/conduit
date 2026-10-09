import type { GitWorktreeManager } from "../../adapters/outbound/git/git-worktree-manager.js"
import type { PoolInferenceUseCase } from "./pool-inference.js"
import { SubagentSandbox } from "./subagent-sandbox.js"
import { ConduitError } from "../ports/conduit-error.js"

export interface SubagentExecutionInput {
  taskId: string
  model: string
  taskDescription: string
  maxSteps?: number | undefined
  repoRoot?: string | undefined
}

export interface SubagentExecutionResult {
  taskId: string
  success: boolean
  diff: string
  summary: string
  modifiedFiles: string[]
  stepsCompleted: number
  accountUsed?: string | undefined
}

interface SubagentAction {
  action: "read_file" | "write_file" | "edit_file" | "run_command" | "finish"
  path?: string
  content?: string
  oldText?: string
  newText?: string
  command?: string
  summary?: string
}

export class SubagentToolLoop {
  constructor(
    private readonly worktreeManager: GitWorktreeManager,
    private readonly poolInference: PoolInferenceUseCase,
  ) {}

  async executeTask(input: SubagentExecutionInput): Promise<SubagentExecutionResult> {
    const cleanTask = input.taskDescription.trim()
    if (!cleanTask) {
      throw new ConduitError("invalid_input", "Task description must not be empty.")
    }

    const maxAllowedSteps = input.maxSteps || 15
    const worktreeContext = await this.worktreeManager.createWorktree(input.taskId)
    const sandbox = new SubagentSandbox(worktreeContext.worktreePath, input.repoRoot)

    let finalSummary = "Task completed by subagent."
    let stepsCompletedCount = 0
    let lastAccountUsedEmail: string | undefined

    try {
      let conversationPrompt = this.buildInitialPrompt(cleanTask)

      while (stepsCompletedCount < maxAllowedSteps) {
        stepsCompletedCount++

        const modelResult = await this.poolInference.execute({
          model: input.model,
          prompt: conversationPrompt,
        })

        if (modelResult.accountUsed?.email) {
          lastAccountUsedEmail = modelResult.accountUsed.email
        }

        const parsedAction = this.extractActionFromText(modelResult.text)
        if (!parsedAction || parsedAction.action === "finish") {
          finalSummary = parsedAction?.summary || modelResult.text
          break
        }

        const actionExecutionResult = await this.executeSandboxAction(sandbox, parsedAction)
        conversationPrompt = `${conversationPrompt}\n\n[Model response]: ${modelResult.text}\n[Tool result]: ${actionExecutionResult}\nWhat is your next action?`
      }

      if (stepsCompletedCount >= maxAllowedSteps) {
        finalSummary = `${finalSummary} (Maximum limit of ${maxAllowedSteps} steps reached).`
      }

      const diffResult = await this.worktreeManager.getDiff(worktreeContext.worktreePath)
      return {
        taskId: input.taskId,
        success: true,
        diff: diffResult.diff,
        summary: finalSummary,
        modifiedFiles: diffResult.modifiedFiles,
        stepsCompleted: stepsCompletedCount,
        accountUsed: lastAccountUsedEmail,
      }
    } finally {
      await this.worktreeManager.cleanupWorktree(worktreeContext)
    }
  }

  private buildInitialPrompt(taskDescription: string): string {
    return `You are an autonomous subagent executing a task in an isolated Git Worktree.
Assigned task: ${taskDescription}

Instructions:
1. Inspect required files using read_file or run tests using run_command.
2. Apply changes using write_file or edit_file.
3. Once verified and complete, emit the finish action.
Always respond in JSON with one of the following schemas:
- {"action": "read_file", "path": "relative/path"}
- {"action": "write_file", "path": "relative/path", "content": "file content"}
- {"action": "edit_file", "path": "relative/path", "oldText": "original text", "newText": "replacement text"}
- {"action": "run_command", "command": "shell command"}
- {"action": "finish", "summary": "explanation of completed work"}
What is your first action?`
  }

  private extractActionFromText(text: string): SubagentAction | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as SubagentAction
        if (parsed && typeof parsed.action === "string") {
          return parsed
        }
      }
    } catch {}
    return null
  }

  private async executeSandboxAction(sandbox: SubagentSandbox, action: SubagentAction): Promise<string> {
    try {
      switch (action.action) {
        case "read_file": {
          if (!action.path) return "Error: missing path property"
          const content = await sandbox.readFile(action.path)
          return `Content of ${action.path}:\n${content}`
        }
        case "write_file": {
          if (!action.path) return "Error: missing path property"
          await sandbox.writeFile(action.path, action.content || "")
          return `File ${action.path} written successfully.`
        }
        case "edit_file": {
          if (!action.path || !action.oldText || action.newText == null) {
            return "Error: missing path, oldText, or newText property"
          }
          await sandbox.editFile(action.path, action.oldText, action.newText)
          return `File ${action.path} edited successfully.`
        }
        case "run_command": {
          if (!action.command) return "Error: missing command property"
          const result = await sandbox.runCommand(action.command)
          return `Command: ${action.command} (exitCode: ${result.exitCode})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        }
        default:
          return "Unrecognized action."
      }
    } catch (error: unknown) {
      const conduitError = ConduitError.from(error)
      return `Error executing action: ${conduitError.message}`
    }
  }
}
