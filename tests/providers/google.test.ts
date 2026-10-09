import { describe, expect, it, vi } from "vitest"
import type { Fetcher } from "../../src/adapters/outbound/providers/http-json.js"
import { GoogleProvider } from "../../src/adapters/outbound/providers/google.js"

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
})

const urlString = (input: Request | URL | string) => input instanceof URL ? input.toString() : String(input)

describe("GoogleProvider", () => {
  it("pages through the catalog, filters generation models, and normalizes IDs", async () => {
    const fetcher = vi.fn<Fetcher>(async (input) => {
      const url = new URL(urlString(input))
      if (url.searchParams.get("pageToken") === "next-page") {
        return jsonResponse({
          models: [{ name: "models/gemini-second", supportedGenerationMethods: ["generateContent"] }],
        })
      }
      return jsonResponse({
        models: [
          { name: "models/gemini-first", supportedGenerationMethods: ["generateContent"] },
          { name: "models/embed-only", supportedGenerationMethods: ["embedContent"] },
        ],
        nextPageToken: "next-page",
      })
    })
    const provider = new GoogleProvider({ GOOGLE_API_KEY: "google-key", GEMINI_API_KEY: "gemini-key" }, fetcher)

    const models = await provider.listModels()

    expect(provider.credentialSource).toBe("GOOGLE_API_KEY")
    expect(models.map((model) => model.id)).toEqual(["gemini-first", "gemini-second"])
    expect(models.every((model) => model.generationSupport === "supported")).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(new URL(urlString(fetcher.mock.calls[1]![0])).searchParams.get("pageToken")).toBe("next-page")
    for (const [input, init] of fetcher.mock.calls) {
      expect(urlString(input)).not.toContain("google-key")
      expect(urlString(input)).not.toContain("gemini-key")
      expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("google-key")
    }
  })

  it("uses Gemini key as a fallback when Google key is unset", () => {
    const provider = new GoogleProvider({ GEMINI_API_KEY: "gemini-key" }, vi.fn<Fetcher>())
    expect(provider.credentialSource).toBe("GEMINI_API_KEY")
  })

  it("sends only the exact prompt to generateContent", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
      candidates: [{ content: { parts: [{ text: "Generated answer" }] } }],
    }))
    const provider = new GoogleProvider({ GOOGLE_API_KEY: "google-key" }, fetcher)
    const prompt = "Use only this exact prompt."

    const text = await provider.generate("gemini-test", prompt)
    const [input, init] = fetcher.mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>

    expect(text).toBe("Generated answer")
    expect(urlString(input)).toContain("/v1beta/models/gemini-test:generateContent")
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: prompt }] }])
    expect(body.systemInstruction).toBeUndefined()
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("google-key")
    expect(JSON.stringify(body)).not.toContain("google-key")
  })

  it("rejects a provider rate limit without retrying", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ error: { message: "private detail" } }, 429))
    const provider = new GoogleProvider({ GOOGLE_API_KEY: "google-key" }, fetcher)

    await expect(provider.generate("gemini-test", "hello"))
      .rejects.toMatchObject({ code: "rate_limited" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("rejects redirects and missing credentials", async () => {
    const redirectingFetch = vi.fn<Fetcher>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/collect" },
    }))
    const configured = new GoogleProvider({ GOOGLE_API_KEY: "google-key" }, redirectingFetch)
    await expect(configured.listModels()).rejects.toMatchObject({ code: "redirect_blocked" })
    expect(redirectingFetch.mock.calls[0]![1]?.redirect).toBe("manual")

    const missingFetch = vi.fn<Fetcher>()
    const missing = new GoogleProvider({}, missingFetch)
    await expect(missing.listModels()).rejects.toMatchObject({ code: "missing_credentials" })
    expect(missingFetch).not.toHaveBeenCalled()
  })
})
