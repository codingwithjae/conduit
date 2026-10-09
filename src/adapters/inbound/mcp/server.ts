import { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { providerIds } from "../../../application/ports/model-provider.js"
import { safeToolError, type ModelService } from "../../../application/use-cases/model-service.js"
import { version } from "../../../core/version.js"
import { FileAccountStore } from "../../outbound/storage/file-account-store.js"
import { QuotaDashboardUseCase } from "../../../application/use-cases/quota-dashboard.js"
import { SubagentToolLoop } from "../../../application/use-cases/subagent-tool-loop.js"
import { GitWorktreeManager } from "../../outbound/git/git-worktree-manager.js"
import { PoolInferenceUseCase } from "../../../application/use-cases/pool-inference.js"
import type { AccountStorePort } from "../../../application/ports/account-store.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"

const providerSchema = z.enum(providerIds)

const providerStatusSchema = z.strictObject({
  providers: z.array(z.strictObject({
    provider: providerSchema,
    configured: z.boolean(),
    credentialSource: z.string().nullable(),
  })),
})

const modelSchema = z.strictObject({
  id: z.string(),
  provider: providerSchema,
  generationSupport: z.enum(["supported", "unknown"]),
})

const modelCatalogSchema = z.strictObject({
  provider: providerSchema,
  fetchedAt: z.string(),
  cacheAgeSeconds: z.number().int().nonnegative(),
  cacheTtlSeconds: z.number().int().nonnegative(),
  models: z.array(modelSchema),
})

const delegatedResponseSchema = z.strictObject({
  provider: providerSchema,
  model: z.string(),
  text: z.string(),
})

const jsonResult = <T extends object>(value: T) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
})

const errorResult = (error: unknown) => {
  const result = safeToolError(error)
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  }
}

export const createMcpServer = (
  service: ModelService,
  store: AccountStorePort = new FileAccountStore(),
  subagentLoop: SubagentToolLoop = new SubagentToolLoop(
    new GitWorktreeManager(),
    new PoolInferenceUseCase(store, service),
  ),
): McpServer => {
  const server = new McpServer(
    { name: "conduit", version },
    {
      capabilities: { tools: {} },
      instructions: "Conduit lists official models and delegates explicitly confirmed user prompts. It also manages quotas and multi-account subscription pools. It does not attach local files or context automatically.",
      cacheHints: {
        "server/discover": { ttlMs: 300_000, cacheScope: "public" },
        "tools/list": { ttlMs: 300_000, cacheScope: "public" },
      },
    },
  )

  server.registerTool("provider_status", {
    title: "Provider configuration status",
    description: "Reports configuration status of supported providers (OpenAI, Google, Anthropic, OpenRouter, DeepSeek, Groq, Ollama). Does not reveal credential values.",
    inputSchema: z.strictObject({}),
    outputSchema: providerStatusSchema,
    annotations: { title: "Provider configuration status", readOnlyHint: true, openWorldHint: false },
  }, async () => jsonResult({ providers: service.getProviderStatus() }))

  server.registerTool("list_models", {
    title: "List available models",
    description: "Queries the official model catalog for any supported provider. Returns model IDs and catalog freshness metadata.",
    inputSchema: z.strictObject({ provider: providerSchema }),
    outputSchema: modelCatalogSchema,
    annotations: { title: "List available models", readOnlyHint: true, openWorldHint: true },
  }, async ({ provider }) => {
    try {
      return jsonResult(await service.listModels(provider))
    } catch (error) {
      return errorResult(error)
    }
  })

  server.registerTool("delegate_task", {
    title: "Delegate prompt to model",
    description: "Sends the exact prompt to the selected provider and model. May incur provider API charges. Requires confirmExternalSend=true and per-call client confirmation. Does not attach files or conversation history automatically.",
    inputSchema: z.strictObject({
      provider: providerSchema,
      model: z.string().min(1).max(200),
      prompt: z.string().max(100_000),
      confirmExternalSend: z.boolean().optional(),
    }),
    outputSchema: delegatedResponseSchema,
    annotations: { title: "Delegate prompt to model", readOnlyHint: false, openWorldHint: true },
  }, async (input) => {
    try {
      return jsonResult(await service.delegateTask(input))
    } catch (error) {
      return errorResult(error)
    }
  })

  // Pools & Quotas tools
  server.registerTool("get_quota_status", {
    title: "Quota and account status",
    description: "Returns consolidated quota status across account pools (Google, OpenAI, Anthropic), remaining percentages, and reset countdowns without exposing credentials.",
    inputSchema: z.strictObject({}),
    annotations: { title: "Quota and account status", readOnlyHint: true, openWorldHint: false },
  }, async () => {
    try {
      const quotaUseCase = new QuotaDashboardUseCase(store)
      const views = await quotaUseCase.getView()
      const sanitizedPools = views.map((view) => ({
        provider: view.provider,
        activeIndex: view.activeIndex,
        accounts: view.accounts.map((account) => ({
          id: account.id,
          provider: account.provider,
          email: account.email,
          alias: account.alias,
          tier: account.tier,
          windows: account.windows,
        })),
      }))
      return jsonResult({ pools: sanitizedPools })
    } catch (error) {
      return errorResult(error)
    }
  })

  server.registerTool("switch_account", {
    title: "Switch active pool account",
    description: "Switches the active account for a given provider in the Conduit pool (by 1-based index, ID, or alias).",
    inputSchema: z.strictObject({
      provider: providerSchema,
      target: z.string().min(1).describe("1-based index, ID, email, or alias of the account to activate"),
    }),
    annotations: { title: "Switch active pool account", readOnlyHint: false, openWorldHint: false },
  }, async ({ provider, target }) => {
    try {
      const switched = await store.switchActive(provider, target)
      return jsonResult({
        success: true,
        message: `Active account for ${provider} switched to: ${switched.alias || switched.email}`,
        account: {
          id: switched.id,
          provider: switched.provider,
          email: switched.email,
          alias: switched.alias,
          tier: switched.tier,
        },
      })
    } catch (error) {
      return errorResult(error)
    }
  })

  server.registerTool("set_account_alias", {
    title: "Set account alias",
    description: "Assigns a friendly alias or clears it (with 'clear') for an account in the pool.",
    inputSchema: z.strictObject({
      provider: providerSchema,
      target: z.string().min(1).describe("1-based index, ID, email, or alias of the account"),
      alias: z.string().describe("New alias to assign or 'clear' to remove it"),
    }),
    annotations: { title: "Set account alias", readOnlyHint: false, openWorldHint: false },
  }, async ({ provider, target, alias }) => {
    try {
      const updated = await store.setAlias(provider, target, alias)
      return jsonResult({
        success: true,
        message: `Alias updated for ${updated.email}: ${updated.alias || "(none)"}`,
        account: {
          id: updated.id,
          provider: updated.provider,
          email: updated.email,
          alias: updated.alias,
        },
      })
    } catch (error) {
      return errorResult(error)
    }
  })

  server.registerTool("dispatch_subagent_task", {
    title: "Dispatch task to subagent in isolated Git Worktree",
    description: "Executes a complex task with an autonomous subagent in an isolated temporary Git Worktree (.conduit/worktrees/) without modifying the supervisor's active branch. Runs local tool loop (read, edit, test) with auto-failover on 429. Returns git diff and summary for supervisor review. Requires confirmExternalSend: true.",
    inputSchema: z.strictObject({
      model: z.string().min(1).describe("Model identifier for the subagent (e.g. gpt-4o, gemini-2.5-pro, deepseek)"),
      task: z.string().min(1).describe("Detailed task description for the subagent to perform"),
      maxSteps: z.number().int().positive().max(50).optional(),
      confirmExternalSend: z.boolean().optional(),
    }),
    annotations: { title: "Dispatch subagent in isolated worktree", readOnlyHint: false, openWorldHint: true },
  }, async (input) => {
    if (input.confirmExternalSend !== true) {
      return errorResult(new ConduitError("consent_required", "Confirm subagent dispatch with confirmExternalSend: true."))
    }
    try {
      const taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
      const result = await subagentLoop.executeTask({
        taskId,
        model: input.model,
        taskDescription: input.task,
        maxSteps: input.maxSteps,
      })
      return jsonResult(result)
    } catch (error: unknown) {
      return errorResult(error)
    }
  })

  return server
}
