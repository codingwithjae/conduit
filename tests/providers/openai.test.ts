import { describe, expect, it, vi } from "vitest"
import { ConduitError } from "../../src/application/ports/conduit-error.js"
import type { Fetcher } from "../../src/adapters/outbound/providers/http-json.js"
import { OpenAIProvider } from "../../src/adapters/outbound/providers/openai.js"

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
})

const urlString = (input: Request | URL | string) => input instanceof URL ? input.toString() : String(input)

describe("OpenAIProvider", () => {
  it("discovers model IDs without inventing generation capabilities", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
      data: [{ id: "gpt-example" }, { id: "embed-example" }],
    }))
    const provider = new OpenAIProvider({ OPENAI_API_KEY: "key-sentinel" }, fetcher)

    const models = await provider.listModels()

    expect(models).toEqual([
      { id: "gpt-example", provider: "openai", generationSupport: "unknown" },
      { id: "embed-example", provider: "openai", generationSupport: "unknown" },
    ])
    const firstCall = fetcher.mock.calls[0]!
    expect(urlString(firstCall[0])).toBe("https://api.openai.com/v1/models")
    expect(new Headers(firstCall[1]?.headers).get("authorization")).toBe("Bearer key-sentinel")
    expect(urlString(firstCall[0])).not.toContain("key-sentinel")
    expect(firstCall[1]?.body).toBeUndefined()
  })

  it("sends only the caller prompt to Responses API and returns the response text", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ output_text: "Generated answer" }))
    const provider = new OpenAIProvider({ OPENAI_API_KEY: "secret-key" }, fetcher)
    const prompt = "Use only this exact prompt."

    const text = await provider.generate("gpt-example", prompt)
    const request = fetcher.mock.calls[0]![1]
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>

    expect(text).toBe("Generated answer")
    expect(body).toEqual({ model: "gpt-example", input: prompt })
    expect(body.instructions).toBeUndefined()
    expect(new Headers(request?.headers).get("authorization")).toBe("Bearer secret-key")
    expect(JSON.stringify(body)).not.toContain("secret-key")
  })

  it("maps a rate limit to a safe error without returning the provider body", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ secret: "body-sentinel" }, 429))
    const provider = new OpenAIProvider({ OPENAI_API_KEY: "secret-key" }, fetcher)

    await expect(provider.generate("gpt-example", "hello"))
      .rejects.toMatchObject({ code: "rate_limited" })
    try {
      await provider.listModels()
    } catch (error) {
      expect(error).toBeInstanceOf(ConduitError)
      expect(String(error)).not.toContain("body-sentinel")
    }
  })

  it("rejects redirects instead of following them", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/collect" },
    }))
    const provider = new OpenAIProvider({ OPENAI_API_KEY: "secret-key" }, fetcher)

    await expect(provider.listModels()).rejects.toMatchObject({ code: "redirect_blocked" })
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe("manual")
  })

  it("does not make a request if the API key is missing", async () => {
    const fetcher = vi.fn<Fetcher>()
    const provider = new OpenAIProvider({}, fetcher)

    await expect(provider.listModels()).rejects.toMatchObject({ code: "missing_credentials" })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
