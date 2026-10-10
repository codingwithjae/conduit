import { describe, expect, it, vi } from "vitest"
import type { Fetcher } from "../../src/adapters/outbound/providers/http-json.js"
import { GoogleSessionDriver } from "../../src/adapters/outbound/providers/google-session.js"
import type { Account } from "../../src/domain/pool/account.js"

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const urlString = (input: Request | URL | string) => (input instanceof URL ? input.toString() : String(input))

describe("GoogleSessionDriver", () => {
  const createMockAccount = (overrides = {}): Account => ({
    id: "g_1",
    provider: "google",
    email: "test@gmail.com",
    tokens: { refresh: "test-refresh-token" },
    addedAt: Date.now(),
    ...overrides,
  })

  it("exchanges refresh token for ephemeral bearer token and calls generateContent", async () => {
    const mockAccount = createMockAccount()
    let callIndex = 0
    const fetcher = vi.fn<Fetcher>(async (input) => {
      callIndex++
      if (callIndex === 1) {
        // Token exchange response
        return jsonResponse({ access_token: "ya29.new-access-token", expires_in: 3600 })
      }
      // Generation response
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: "Gemini native answer" }] } }],
      })
    })

    const driver = new GoogleSessionDriver(fetcher)
    const result = await driver.generate(mockAccount, "gemini-3.8-flash", "Hello Gemini")

    expect(result).toBe("Gemini native answer")
    expect(mockAccount.tokens.access).toBe("ya29.new-access-token")
    expect(fetcher).toHaveBeenCalledTimes(2)

    // First call: token exchange
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0]!
    expect(urlString(tokenUrl)).toBe("https://oauth2.googleapis.com/token")
    expect(String(tokenInit?.body)).toContain("grant_type=refresh_token")
    expect(String(tokenInit?.body)).toContain("refresh_token=test-refresh-token")

    // Second call: generation with Bearer header
    const [genUrl, genInit] = fetcher.mock.calls[1]!
    expect(urlString(genUrl)).toContain("/v1beta/models/gemini-3.8-flash:generateContent")
    expect(new Headers(genInit?.headers).get("authorization")).toBe("Bearer ya29.new-access-token")
  })

  it("reuses existing valid access token without calling token endpoint", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "Cached answer" }] } }],
      }),
    )

    const accountWithValidToken: Account = {
      ...createMockAccount(),
      tokens: {
        refresh: "rt",
        access: "ya29.already-valid",
        expiresAt: Date.now() + 3600000,
      },
    }

    const driver = new GoogleSessionDriver(fetcher)
    const result = await driver.generate(accountWithValidToken, "gemini-3.8-flash", "Prompt")

    expect(result).toBe("Cached answer")
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(urlString(fetcher.mock.calls[0]![0])).toContain("generateContent")
  })

  it("maps HTTP 429 on generation to rate_limited error", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse({ error: { message: "Quota exhausted" } }, 429))

    const accountWithToken: Account = {
      ...createMockAccount(),
      tokens: { refresh: "rt", access: "ya29.valid", expiresAt: Date.now() + 3600000 },
    }

    const driver = new GoogleSessionDriver(fetcher)
    await expect(driver.generate(accountWithToken, "gemini-3.8-flash", "Prompt")).rejects.toMatchObject({
      code: "rate_limited",
    })
  })

  it("maps invalid refresh token to token_revoked error", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse({ error: "invalid_grant", error_description: "Token has been revoked" }, 400),
    )

    const driver = new GoogleSessionDriver(fetcher)
    await expect(driver.ensureAccessToken(createMockAccount())).rejects.toMatchObject({
      code: "token_revoked",
    })
  })
})
