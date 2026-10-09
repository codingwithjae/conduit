import React from "react"
import { render } from "ink"
import { Command, CommanderError } from "commander"
import { version } from "../../../core/version.js"
import { serveMcp } from "../mcp/serve.js"
import { FileAccountStore } from "../../outbound/storage/file-account-store.js"
import { QuotaDashboardUseCase } from "../../../application/use-cases/quota-dashboard.js"
import { ImportAccountsUseCase } from "../../../application/use-cases/import-accounts.js"
import { AntigravityImporter } from "../../outbound/importers/antigravity-importer.js"
import { CodexImporter } from "../../outbound/importers/codex-importer.js"
import { ClaudeCodeImporter } from "../../outbound/importers/claude-code-importer.js"
import { QuotaDashboard } from "./tui/QuotaDashboard.js"
import { AccountManager } from "./tui/AccountManager.js"
import { PoolInferenceUseCase } from "../../../application/use-cases/pool-inference.js"
import { SubagentToolLoop } from "../../../application/use-cases/subagent-tool-loop.js"
import { GitWorktreeManager } from "../../outbound/git/git-worktree-manager.js"
import { ModelService } from "../../../application/use-cases/model-service.js"
import { createProviderRegistry } from "../../outbound/providers/registry.js"
import type { AccountStorePort } from "../../../application/ports/account-store.js"
import type { AccountImporterPort } from "../../../application/ports/account-importer.js"
import type { ProviderId } from "../../../application/ports/model-provider.js"
import { providerIds } from "../../../application/ports/model-provider.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"

export interface CliOutput {
  stdout: { write: (chunk: string) => unknown }
  stderr: { write: (chunk: string) => unknown }
}

export interface ProgramOptions {
  output?: CliOutput
  setExitCode?: (exitCode: number) => void
  store?: AccountStorePort
  importers?: AccountImporterPort[]
  poolInferenceUseCase?: PoolInferenceUseCase
  subagentLoop?: SubagentToolLoop
}

const defaultOutput: CliOutput = {
  stdout: process.stdout,
  stderr: process.stderr,
}

export const createProgram = (
  optionsOrOutput: CliOutput | ProgramOptions = defaultOutput,
  legacySetExitCode: (exitCode: number) => void = () => {},
): Command => {
  const options: ProgramOptions =
    "stdout" in optionsOrOutput
      ? { output: optionsOrOutput, setExitCode: legacySetExitCode }
      : optionsOrOutput

  const output = options.output || defaultOutput
  const setExitCode = options.setExitCode || (() => {})
  const store = options.store || new FileAccountStore()
  const importers =
    options.importers || [
      new AntigravityImporter(),
      new CodexImporter(),
      new ClaudeCodeImporter(),
    ]

  const program = new Command()

  program
    .name("conduit")
    .description("Terminal-first CLI and MCP server for model delegation and subscription pools")
    .version(version, "-v, --version")
    .showHelpAfterError("Run 'conduit --help' for usage details.")
    .configureOutput({
      writeOut: (text) => { output.stdout.write(text) },
      writeErr: (text) => { output.stderr.write(text) },
    })
    .exitOverride()

  // mcp serve
  program
    .command("mcp")
    .description("MCP server commands for agent clients")
    .command("serve")
    .description("Starts the MCP server over stdio")
    .action(async () => {
      setExitCode(await serveMcp())
    })

  // quota
  program
    .command("quota")
    .description("Displays account quota dashboard")
    .option("--text", "Outputs plain text without interactive TUI")
    .option("--refresh", "Refreshes quotas by querying live provider sources")
    .action(async (commandOptions) => {
      const useCase = new QuotaDashboardUseCase(store)
      const views = await useCase.getView(Boolean(commandOptions.refresh))

      if (commandOptions.text || !process.stdout.isTTY) {
        output.stdout.write(useCase.formatPlainText(views) + "\n")
        return
      }

      try {
        const inkInstance = render(React.createElement(QuotaDashboard, { initialViews: views, store }))
        await inkInstance.waitUntilExit()
      } catch {
        // Fallback to text if interactive TUI cannot be initialized
        output.stdout.write(useCase.formatPlainText(views) + "\n")
      }
    })

  // use <model> <prompt...>
  program
    .command("use <model> <prompt...>")
    .description("Executes inference backed by subscription pool or API key")
    .option("--api-key", "Forces using official configured API key instead of pool")
    .action(async (modelArgument, promptTokens, commandOptions) => {
      const fullPrompt = Array.isArray(promptTokens) ? promptTokens.join(" ") : String(promptTokens)
      const poolInferenceUseCase =
        options.poolInferenceUseCase ||
        new PoolInferenceUseCase(store, new ModelService(createProviderRegistry()))

      try {
        const result = await poolInferenceUseCase.execute({
          model: modelArgument,
          prompt: fullPrompt,
          forceApiKey: Boolean(commandOptions.apiKey),
        })

        if (result.rotatedFromAccounts?.length) {
          output.stderr.write(
            `[i] Rate limit reached on ${result.rotatedFromAccounts.join(", ")}. Retried successfully via: ${result.accountUsed?.alias || result.accountUsed?.email}\n`,
          )
        } else if (result.accountUsed) {
          const accountName = result.accountUsed.alias
            ? `${result.accountUsed.alias} (${result.accountUsed.email})`
            : result.accountUsed.email
          output.stderr.write(`[i] Model: ${result.provider}/${result.model} · Account: ${accountName}\n`)
        }

        output.stdout.write(result.text + "\n")
      } catch (error: unknown) {
        const conduitError = ConduitError.from(error)
        output.stderr.write(`Error: ${conduitError.message}\n`)
        setExitCode(1)
      }
    })

  // dispatch <model> <task...>
  program
    .command("dispatch <model> <task...>")
    .description("Dispatches a task to an autonomous subagent in an isolated Git Worktree")
    .option("--max-steps <number>", "Maximum number of steps in the agentic tool loop", "15")
    .action(async (modelArgument, taskTokens, commandOptions) => {
      const fullTask = Array.isArray(taskTokens) ? taskTokens.join(" ") : String(taskTokens)
      const subagentLoop =
        options.subagentLoop ||
        new SubagentToolLoop(
          new GitWorktreeManager(),
          options.poolInferenceUseCase ||
            new PoolInferenceUseCase(store, new ModelService(createProviderRegistry())),
        )

      try {
        const taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        output.stderr.write(`[i] Provisioning isolated Git Worktree for subagent (${modelArgument})...\n`)
        const result = await subagentLoop.executeTask({
          taskId,
          model: modelArgument,
          taskDescription: fullTask,
          maxSteps: parseInt(commandOptions.maxSteps, 10) || 15,
        })

        output.stderr.write(`[✓] ${result.summary} (Steps completed: ${result.stepsCompleted})\n`)
        if (result.modifiedFiles.length > 0) {
          output.stderr.write(`[i] Modified files: ${result.modifiedFiles.join(", ")}\n\n`)
        }

        if (result.diff) {
          output.stdout.write(result.diff + "\n")
        } else {
          output.stdout.write("(No changes generated in repository)\n")
        }
      } catch (error: unknown) {
        const conduitError = ConduitError.from(error)
        output.stderr.write(`Error: ${conduitError.message}\n`)
        setExitCode(1)
      }
    })

  // account group
  const accountCommand = program
    .command("account")
    .description("Manage subscription accounts and pools")
    .action(async () => {
      const state = await store.load()
      if (!process.stdout.isTTY) {
        renderPlainTextAccountList(state, output)
        return
      }

      try {
        const inkInstance = render(React.createElement(AccountManager, { initialState: state, store }))
        await inkInstance.waitUntilExit()
      } catch {
        renderPlainTextAccountList(state, output)
      }
    })

  // account list
  accountCommand
    .command("list")
    .description("Lists accounts configured in the pool")
    .action(async () => {
      const state = await store.load()
      renderPlainTextAccountList(state, output)
    })

  // account switch <provider> <target>
  accountCommand
    .command("switch <provider> <target>")
    .description("Switches active account for a provider (by 1-based index, ID, or alias)")
    .action(async (providerArgument, targetArgument) => {
      const normalizedProviderId = providerArgument.toLowerCase() as ProviderId
      if (!providerIds.includes(normalizedProviderId)) {
        output.stderr.write(`Error: provider '${providerArgument}' is not supported.\n`)
        setExitCode(1)
        return
      }
      try {
        const switchedAccount = await store.switchActive(normalizedProviderId, targetArgument)
        output.stdout.write(`Active account for ${normalizedProviderId} switched to: ${switchedAccount.alias || switchedAccount.email}\n`)
      } catch (error: unknown) {
        const conduitError = ConduitError.from(error)
        output.stderr.write(`Error: ${conduitError.message}\n`)
        setExitCode(1)
      }
    })

  // account alias <provider> <target> <alias>
  accountCommand
    .command("alias <provider> <target> <alias>")
    .description("Assigns or clears ('clear') an alias for an account")
    .action(async (providerArgument, targetArgument, aliasArgument) => {
      const normalizedProviderId = providerArgument.toLowerCase() as ProviderId
      if (!providerIds.includes(normalizedProviderId)) {
        output.stderr.write(`Error: provider '${providerArgument}' is not supported.\n`)
        setExitCode(1)
        return
      }
      try {
        const updatedAccount = await store.setAlias(normalizedProviderId, targetArgument, aliasArgument)
        output.stdout.write(`Alias updated for ${updatedAccount.email}: ${updatedAccount.alias || "(none)"}\n`)
      } catch (error: unknown) {
        const conduitError = ConduitError.from(error)
        output.stderr.write(`Error: ${conduitError.message}\n`)
        setExitCode(1)
      }
    })

  // account import
  accountCommand
    .command("import")
    .description("Discovers and imports local accounts from Antigravity, Codex, and Claude Code")
    .action(async () => {
      output.stdout.write("Scanning available local sources...\n")
      const importUseCase = new ImportAccountsUseCase(store, importers)
      const importReport = await importUseCase.importAll()

      if (importReport.totalDiscovered === 0) {
        output.stdout.write("No accounts detected in standard local paths.\n")
        return
      }

      output.stdout.write(`Scanned sources: ${importReport.scannedSources.join(", ")}\n`)
      output.stdout.write(`Total accounts imported/updated: ${importReport.totalDiscovered}\n`)
      output.stdout.write("Accounts ready in ~/.conduit/pools.json (0600 permissions).\n")
    })

  return program
}

export const runCli = async (
  args: string[] = process.argv.slice(2),
  outputOrOptions: CliOutput | ProgramOptions = defaultOutput,
): Promise<number> => {
  let commandExitCode = 0
  const options: ProgramOptions =
    "stdout" in outputOrOptions
      ? { output: outputOrOptions, setExitCode: (code) => { commandExitCode = code } }
      : { ...outputOrOptions, setExitCode: (code) => { commandExitCode = code } }

  const program = createProgram(options)

  if (args.length === 0) {
    program.outputHelp()
    return 0
  }

  const firstArgument = args[0]
  if (
    firstArgument &&
    !firstArgument.startsWith("-") &&
    !program.commands.some((command) => command.name() === firstArgument)
  ) {
    const out = options.output || defaultOutput
    out.stderr.write(`Error: unknown command '${firstArgument}'. Run 'conduit --help'.\n`)
    return 1
  }

  try {
    await program.parseAsync(args, { from: "user" })
    return commandExitCode
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode
    throw error
  }
}

function renderPlainTextAccountList(state: { pools: Record<string, { accounts: any[]; activeIndex: number }> }, output: CliOutput): void {
  const outputLines: string[] = ["CONDUIT ACCOUNT POOLS", ""]
  let totalAccountsCount = 0

  for (const [providerName, pool] of Object.entries(state.pools)) {
    if (!pool.accounts.length) continue
    totalAccountsCount += pool.accounts.length
    outputLines.push(providerName.toUpperCase())

    for (const [accountIndex, account] of pool.accounts.entries()) {
      const activeLabel = accountIndex === pool.activeIndex ? " (active)" : ""
      const displayName = account.alias ? `${account.alias} (${account.email})` : account.email
      const tierLabel = account.tier ? ` · ${account.tier}` : ""
      outputLines.push(`  ${accountIndex + 1}. ${displayName}${tierLabel}${activeLabel}`)
    }
    outputLines.push("")
  }

  if (totalAccountsCount === 0) {
    output.stdout.write("No accounts configured. Run 'conduit account import'.\n")
    return
  }
  output.stdout.write(outputLines.join("\n").trim() + "\n")
}
