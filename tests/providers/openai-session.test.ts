import { describe, expect, it, vi } from "vitest"
import type { Fetcher } from "../../src/adapters/outbound/providers/http-json.js"
import { OpenAiSessionDriver } from "../../src/adapters/outbound/providers/openai-session.js"
import type { Account } from "../../src/domain/pool/account.js"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const urlString = (input: Request | URL | string) => (input instanceof URL ? input.toString() : String(input))

describe("OpenAiSessionDriver", () => {
  const createMockAccount = (overrides = {}): Account => ({
    id: "user-123",
    provider: "openai",
    email: "test@chatgpt.com",
    tokens: { refresh: "test-refresh-token" },
    addedAt: Date.now(),
    ...overrides,
  })

  it("refreshes expired token and calls chat completions with session headers", async () => {
    let callIndex = 0
    const fetcher = vi.fn<Fetcher>(async (input) => {
      callIndex++
      if (callIndex === 1) {
        return jsonResponse({ access_token: "new-oa-access-token", expires_in: 3600 })
      }
      return jsonResponse({
        choices: [{ message: { role: "assistant", content: "OpenAI session answer" } }],
      })
    })

    const account = createMockAccount()
    const driver = new OpenAiSessionDriver(fetcher)
    const result = await driver.generate(account, "gpt-4o", "Hello GPT")

    expect(result).toBe("OpenAI session answer")
    expect(account.tokens.access).toBe("new-oa-access-token")
    expect(fetcher).toHaveBeenCalledTimes(2)

    // First call: token refresh
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0]!
    expect(urlString(tokenUrl)).toBe("https://auth.openai.com/oauth/token")
    expect(String(tokenInit?.body)).toContain("grant_type=refresh_token")
    expect(String(tokenInit?.body)).toContain("client_id=app_EMoamEEZ73f0CkXaXp7hrann")

    // Second call: completions
    const [compUrl, compInit] = fetcher.mock.calls[1]!
    expect(urlString(compUrl)).toBe("https://api.openai.com/v1/chat/completions")
    const headers = new Headers(compInit?.headers)
    expect(headers.get("authorization")).toBe("Bearer new-oa-access-token")
    expect(headers.get("chatgpt-account-id")).toBe("user-123")
  })

  it("maps 429 rate limit to rate_limited error", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ error: { message: "Rate limit reached" } }, 429))
    const account = createMockAccount({
      tokens: { refresh: "rt", access: "valid-acc", expiresAt: Date.now() + 3600000 },
    })

    const driver = new OpenAiSessionDriver(fetcher)
    await expect(driver.generate(account, "gpt-4o", "Prompt")).rejects.toMatchObject({
      code: "rate_limited",
    })
  })

  it("maps invalid refresh token to token_revoked error", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse({ error: "invalid_grant", error_description: "Refresh token expired" }, 401),
    )

    const driver = new OpenAiSessionDriver(fetcher)
    await expect(driver.ensureAccessToken(createMockAccount())).rejects.toMatchObject({
      code: "token_revoked",
    })
  })
})
