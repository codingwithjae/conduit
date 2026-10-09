import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"
import { once } from "node:events"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

interface ToolStatus {
  provider: string
  configured: boolean
  credentialSource: string | null
}

interface JsonRpcResult {
  resultType?: string
  supportedVersions?: string[]
  capabilities?: { tools?: Record<string, unknown> }
  _meta?: Record<string, unknown>
  ttlMs?: number
  cacheScope?: string
  tools?: Array<{ name: string }>
  structuredContent?: { providers: ToolStatus[] }
  isError?: boolean
  content?: Array<{ type: string; text: string }>
  protocolVersion?: string
}

interface JsonRpcMessage {
  jsonrpc: "2.0"
  id?: string | number
  method?: string
  result?: JsonRpcResult
  error?: Record<string, unknown>
}

interface McpProcess {
  child: ChildProcessWithoutNullStreams
  send: (message: Record<string, unknown>) => void
  nextResponse: () => Promise<JsonRpcMessage>
}

const running: ChildProcessWithoutNullStreams[] = []

const startServer = (): McpProcess => {
  const bin = resolve(process.cwd(), "bin/conduit.js")
  const child = spawn(process.execPath, [bin, "mcp", "serve"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || "",
      HOME: process.env.HOME || "",
      NODE_ENV: "test",
    },
    stdio: ["pipe", "pipe", "pipe"],
  })
  running.push(child)
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const iterator = lines[Symbol.asyncIterator]()

  return {
    child,
    send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
    nextResponse: async () => {
      while (true) {
        let timeout: ReturnType<typeof setTimeout> | undefined
        let line: IteratorResult<string>
        try {
          line = await Promise.race([
            iterator.next(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error("Timed out waiting for MCP response")), 15_000)
            }),
          ])
        } finally {
          if (timeout) clearTimeout(timeout)
        }
        if (line.done) throw new Error("MCP server closed stdout before replying")
        const message = JSON.parse(line.value) as JsonRpcMessage
        if (message.id !== undefined) return message
      }
    },
  }
}

const closeServer = async (child: ChildProcessWithoutNullStreams) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.stdin.end()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      once(child, "exit"),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("MCP server did not stop after stdin closed")), 15_000)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

const stopServerWithSignal = async (
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): Promise<[number | null, NodeJS.Signals | null]> => {
  const exit = once(child, "exit") as Promise<[number | null, NodeJS.Signals | null]>
  child.kill(signal)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      exit,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`MCP server did not exit after ${signal}`)), 5_000)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

afterEach(() => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
  }
})

describe("Conduit MCP stdio", () => {
  it("supports modern discovery and tool calls without initialization", async () => {
    const mcp = startServer()
    const metadata = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "conduit-test", version: "1" },
      "io.modelcontextprotocol/clientCapabilities": {},
    }

    try {
      mcp.send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: metadata } })
      const discovery = (await mcp.nextResponse()).result!
      expect(discovery.resultType).toBe("complete")
      expect(discovery.supportedVersions).toContain("2026-07-28")
      expect(discovery.capabilities?.tools).toEqual({ listChanged: true })
      const serverInfo = discovery._meta?.["io.modelcontextprotocol/serverInfo"] as { name?: string } | undefined
      expect(serverInfo?.name).toBe("conduit")
      expect(discovery.ttlMs).toBe(300_000)
      expect(discovery.cacheScope).toBe("public")

      mcp.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: metadata } })
      const toolsList = (await mcp.nextResponse()).result!
      expect(toolsList.resultType).toBe("complete")
      expect(toolsList.tools?.map((tool) => tool.name)).toEqual([
        "provider_status",
        "list_models",
        "delegate_task",
        "get_quota_status",
        "switch_account",
        "set_account_alias",
        "dispatch_subagent_task",
      ])
      expect(toolsList.ttlMs).toBe(300_000)

      mcp.send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "provider_status", arguments: {}, _meta: metadata },
      })
      const status = (await mcp.nextResponse()).result!
      expect(status.resultType).toBe("complete")
      expect(status.structuredContent?.providers).toEqual([
        { provider: "openai", configured: false, credentialSource: null },
        { provider: "google", configured: false, credentialSource: null },
        { provider: "anthropic", configured: false, credentialSource: null },
        { provider: "openrouter", configured: false, credentialSource: null },
        { provider: "deepseek", configured: false, credentialSource: null },
        { provider: "groq", configured: false, credentialSource: null },
        { provider: "ollama", configured: false, credentialSource: null },
      ])

      mcp.send({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "list_models", arguments: { provider: "openai" }, _meta: metadata },
      })
      const missingCatalog = (await mcp.nextResponse()).result!
      expect(missingCatalog.isError).toBe(true)
      expect(missingCatalog.content?.[0]?.text).toContain("missing_credentials")

      mcp.send({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "delegate_task",
          arguments: { provider: "openai", model: "gpt-test", prompt: "hello" },
          _meta: metadata,
        },
      })
      const consent = (await mcp.nextResponse()).result!
      expect(consent.resultType).toBe("complete")
      expect(consent.isError).toBe(true)
      expect(consent.content?.[0]?.text).toContain("consent_required")

      mcp.send({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "get_quota_status",
          arguments: {},
          _meta: metadata,
        },
      })
      const quotaStatus = (await mcp.nextResponse()).result!
      expect(quotaStatus.resultType).toBe("complete")
      expect(quotaStatus.isError).toBeFalsy()

      await closeServer(mcp.child)
    } finally {
      if (mcp.child.exitCode === null && mcp.child.signalCode === null) mcp.child.kill("SIGKILL")
    }
  })

  it("supports legacy initialize clients without modern response fields", async () => {
    const mcp = startServer()

    try {
      mcp.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "conduit-test-legacy", version: "1" },
        },
      })
      const initialized = (await mcp.nextResponse()).result!
      expect(initialized.protocolVersion).toBe("2025-11-25")

      mcp.send({ jsonrpc: "2.0", method: "notifications/initialized" })
      mcp.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
      const toolsList = (await mcp.nextResponse()).result!
      expect(toolsList.tools?.map((tool) => tool.name)).toEqual([
        "provider_status",
        "list_models",
        "delegate_task",
        "get_quota_status",
        "switch_account",
        "set_account_alias",
        "dispatch_subagent_task",
      ])
      expect(toolsList.resultType).toBeUndefined()
      expect(toolsList.ttlMs).toBeUndefined()

      await closeServer(mcp.child)
    } finally {
      if (mcp.child.exitCode === null && mcp.child.signalCode === null) mcp.child.kill("SIGKILL")
    }
  })

  it.each([["SIGINT", 130], ["SIGTERM", 143]] as const)("shuts down on %s", async (signal, expectedExitCode) => {
    const mcp = startServer()
    const metadata = {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { name: "conduit-signal-test", version: "1" },
      "io.modelcontextprotocol/clientCapabilities": {},
    }

    try {
      mcp.send({ jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: metadata } })
      await mcp.nextResponse()
      const [exitCode, exitSignal] = await stopServerWithSignal(mcp.child, signal)
      expect(exitSignal).toBeNull()
      expect(exitCode).toBe(expectedExitCode)
    } finally {
      if (mcp.child.exitCode === null && mcp.child.signalCode === null) mcp.child.kill("SIGKILL")
    }
  })
})
