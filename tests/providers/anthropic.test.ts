import { describe, expect, it, vi } from "vitest"
import type { Fetcher } from "../../src/adapters/outbound/providers/http-json.js"
import { AnthropicProvider } from "../../src/adapters/outbound/providers/anthropic.js"

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
})

const urlString = (input: Request | URL | string) => input instanceof URL ? input.toString() : String(input)

describe("AnthropicProvider", () => {
  it("lists models from GET /v1/models with official headers", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
      data: [{ id: "claude-3-7-sonnet-20250219" }, { id: "claude-3-5-haiku-20241022" }],
    }))
    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: "sk-ant-test" }, fetcher)

    const models = await provider.listModels()

    expect(provider.credentialSource).toBe("ANTHROPIC_API_KEY")
    expect(models).toEqual([
      { id: "claude-3-7-sonnet-20250219", provider: "anthropic", generationSupport: "supported" },
      { id: "claude-3-5-haiku-20241022", provider: "anthropic", generationSupport: "supported" },
    ])
    const [input, init] = fetcher.mock.calls[0]!
    expect(urlString(input)).toBe("https://api.anthropic.com/v1/models")
    expect(new Headers(init?.headers).get("x-api-key")).toBe("sk-ant-test")
    expect(new Headers(init?.headers).get("anthropic-version")).toBe("2023-06-01")
    expect(urlString(input)).not.toContain("sk-ant-test")
  })

  it("generates text using Messages API format", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
      content: [{ type: "text", text: "Claude response text" }],
    }))
    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: "sk-ant-test" }, fetcher)

    const text = await provider.generate("claude-3-7-sonnet-20250219", "Explain this function")

    expect(text).toBe("Claude response text")
    const [input, init] = fetcher.mock.calls[0]!
    expect(urlString(input)).toBe("https://api.anthropic.com/v1/messages")
    const headers = new Headers(init?.headers)
    expect(headers.get("x-api-key")).toBe("sk-ant-test")
    expect(headers.get("anthropic-version")).toBe("2023-06-01")
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Explain this function" }],
    })
  })

  it("fails with missing_credentials when ANTHROPIC_API_KEY is not set", async () => {
    const fetcher = vi.fn<Fetcher>()
    const provider = new AnthropicProvider({}, fetcher)

    expect(provider.credentialSource).toBeNull()
    await expect(provider.listModels()).rejects.toMatchObject({ code: "missing_credentials" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("maps 429 to rate_limited without exposing headers or body", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ error: { message: "Rate limit exceeded" } }, 429))
    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: "sk-ant-test" }, fetcher)

    await expect(provider.generate("claude-3-7-sonnet-20250219", "Hello")).rejects.toMatchObject({
      code: "rate_limited",
    })
  })

  it("blocks redirects with redirect_blocked", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(null, {
      status: 307,
      headers: { location: "https://redirect.example" },
    }))
    const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: "sk-ant-test" }, fetcher)

    await expect(provider.listModels()).rejects.toMatchObject({ code: "redirect_blocked" })
  })
})
