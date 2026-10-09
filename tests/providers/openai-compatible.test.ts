import { describe, expect, it, vi } from "vitest"
import type { Fetcher } from "../../src/adapters/outbound/providers/http-json.js"
import { OpenAICompatibleProvider } from "../../src/adapters/outbound/providers/openai-compatible.js"

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
})

const urlString = (input: Request | URL | string) => input instanceof URL ? input.toString() : String(input)

describe("OpenAICompatibleProvider", () => {
  describe("OpenRouter", () => {
    it("lists models using Bearer token without dropping entries", async () => {
      const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
        data: [{ id: "anthropic/claude-3.7-sonnet" }, { id: "meta-llama/llama-3.3-70b-instruct" }],
      }))
      const provider = new OpenAICompatibleProvider(
        { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", credentialEnvVar: "OPENROUTER_API_KEY" },
        { OPENROUTER_API_KEY: "sk-or-test" },
        fetcher,
      )

      const models = await provider.listModels()

      expect(provider.credentialSource).toBe("OPENROUTER_API_KEY")
      expect(models).toEqual([
        { id: "anthropic/claude-3.7-sonnet", provider: "openrouter", generationSupport: "unknown" },
        { id: "meta-llama/llama-3.3-70b-instruct", provider: "openrouter", generationSupport: "unknown" },
      ])
      const [input, init] = fetcher.mock.calls[0]!
      expect(urlString(input)).toBe("https://openrouter.ai/api/v1/models")
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-or-test")
    })

    it("generates completions via Chat Completions endpoint", async () => {
      const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
        choices: [{ message: { role: "assistant", content: "OpenRouter response" } }],
      }))
      const provider = new OpenAICompatibleProvider(
        { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", credentialEnvVar: "OPENROUTER_API_KEY" },
        { OPENROUTER_API_KEY: "sk-or-test" },
        fetcher,
      )

      const text = await provider.generate("anthropic/claude-3.7-sonnet", "Hello world")

      expect(text).toBe("OpenRouter response")
      const [input, init] = fetcher.mock.calls[0]!
      expect(urlString(input)).toBe("https://openrouter.ai/api/v1/chat/completions")
      const body = JSON.parse(String(init?.body))
      expect(body).toEqual({
        model: "anthropic/claude-3.7-sonnet",
        messages: [{ role: "user", content: "Hello world" }],
      })
    })
  })

  describe("DeepSeek", () => {
    it("authenticates with DEEPSEEK_API_KEY", async () => {
      const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
        choices: [{ message: { content: "DeepSeek R1 reasoning" } }],
      }))
      const provider = new OpenAICompatibleProvider(
        { id: "deepseek", baseUrl: "https://api.deepseek.com/v1", credentialEnvVar: "DEEPSEEK_API_KEY" },
        { DEEPSEEK_API_KEY: "sk-ds-test" },
        fetcher,
      )

      const text = await provider.generate("deepseek-reasoner", "Solve this problem")

      expect(text).toBe("DeepSeek R1 reasoning")
      const [input, init] = fetcher.mock.calls[0]!
      expect(urlString(input)).toBe("https://api.deepseek.com/v1/chat/completions")
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-ds-test")
    })
  })

  describe("Groq", () => {
    it("authenticates with GROQ_API_KEY", async () => {
      const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
        choices: [{ message: { content: "Ultra fast Groq response" } }],
      }))
      const provider = new OpenAICompatibleProvider(
        { id: "groq", baseUrl: "https://api.groq.com/openai/v1", credentialEnvVar: "GROQ_API_KEY" },
        { GROQ_API_KEY: "gsk-test" },
        fetcher,
      )

      const text = await provider.generate("llama-3.3-70b-versatile", "Fast response")

      expect(text).toBe("Ultra fast Groq response")
      expect(provider.credentialSource).toBe("GROQ_API_KEY")
    })
  })

  describe("Ollama", () => {
    it("reports configured when OLLAMA_BASE_URL is set and sends no auth header", async () => {
      const fetcher = vi.fn<Fetcher>(async () => jsonResponse({
        data: [{ id: "llama3:latest" }, { id: "qwen2.5-coder:32b" }],
      }))
      const provider = new OpenAICompatibleProvider(
        { id: "ollama", baseUrl: "http://localhost:11434/v1", authHeaderType: "none" },
        { OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1" },
        fetcher,
      )

      expect(provider.credentialSource).toBe("OLLAMA_BASE_URL")
      const models = await provider.listModels()
      expect(models).toEqual([
        { id: "llama3:latest", provider: "ollama", generationSupport: "unknown" },
        { id: "qwen2.5-coder:32b", provider: "ollama", generationSupport: "unknown" },
      ])
      const [input, init] = fetcher.mock.calls[0]!
      expect(urlString(input)).toBe("http://127.0.0.1:11434/v1/models")
      expect(new Headers(init?.headers).get("authorization")).toBeNull()
    })

    it("reports not configured when OLLAMA_BASE_URL is missing", async () => {
      const fetcher = vi.fn<Fetcher>()
      const provider = new OpenAICompatibleProvider(
        { id: "ollama", baseUrl: "http://localhost:11434/v1", authHeaderType: "none" },
        {},
        fetcher,
      )

      expect(provider.credentialSource).toBeNull()
      await expect(provider.listModels()).rejects.toMatchObject({ code: "missing_credentials" })
      expect(fetcher).not.toHaveBeenCalled()
    })
  })

  describe("Error handling", () => {
    it("maps 429 rate limit to rate_limited error", async () => {
      const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ error: "rate limit" }, 429))
      const provider = new OpenAICompatibleProvider(
        { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", credentialEnvVar: "OPENROUTER_API_KEY" },
        { OPENROUTER_API_KEY: "sk-test" },
        fetcher,
      )

      await expect(provider.generate("some-model", "hi")).rejects.toMatchObject({ code: "rate_limited" })
    })

    it("rejects redirects with redirect_blocked", async () => {
      const fetcher = vi.fn<Fetcher>(async () => new Response(null, {
        status: 301,
        headers: { location: "https://malicious.example" },
      }))
      const provider = new OpenAICompatibleProvider(
        { id: "deepseek", baseUrl: "https://api.deepseek.com/v1", credentialEnvVar: "DEEPSEEK_API_KEY" },
        { DEEPSEEK_API_KEY: "sk-test" },
        fetcher,
      )

      await expect(provider.listModels()).rejects.toMatchObject({ code: "redirect_blocked" })
    })

    it("fails with missing_credentials when API key is missing", async () => {
      const fetcher = vi.fn<Fetcher>()
      const provider = new OpenAICompatibleProvider(
        { id: "groq", baseUrl: "https://api.groq.com/openai/v1", credentialEnvVar: "GROQ_API_KEY" },
        {},
        fetcher,
      )

      expect(provider.credentialSource).toBeNull()
      await expect(provider.listModels()).rejects.toMatchObject({ code: "missing_credentials" })
      expect(fetcher).not.toHaveBeenCalled()
    })
  })
})
