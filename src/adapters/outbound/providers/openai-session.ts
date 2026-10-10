import type { Account } from "../../../domain/pool/account.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"
import { asObject, type Fetcher } from "./http-json.js"

export const OPENAI_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token"
export const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
export const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"

export class OpenAiSessionDriver {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async ensureAccessToken(account: Account): Promise<string> {
    const currentAccessToken = account.tokens.access
    const expiresAtMs = account.tokens.expiresAt
    const isTokenStillValid = currentAccessToken && (!expiresAtMs || expiresAtMs >= Date.now() + 30_000)

    if (isTokenStillValid) {
      return currentAccessToken
    }

    if (!account.tokens.refresh) {
      throw new ConduitError("missing_credentials", "No refresh token available for OpenAI account.")
    }

    let response: Response
    try {
      response = await this.fetcher(new URL(OPENAI_OAUTH_TOKEN_URL), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: account.tokens.refresh,
          client_id: OPENAI_CODEX_CLIENT_ID,
        }).toString(),
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error: unknown) {
      throw ConduitError.from(error, "provider_unavailable")
    }

    if (response.status === 400 || response.status === 401) {
      throw new ConduitError(
        "token_revoked",
        `OpenAI session token for ${account.email} is revoked or expired. Run 'conduit account import'.`,
      )
    }

    if (!response.ok) {
      throw new ConduitError("provider_rejected", `OpenAI token refresh failed (HTTP ${response.status}).`)
    }

    const payload = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }
    if (!payload.access_token) {
      throw new ConduitError("invalid_response", "OpenAI token response did not contain an access token.")
    }

    account.tokens.access = payload.access_token
    if (payload.refresh_token) {
      account.tokens.refresh = payload.refresh_token
    }
    account.tokens.expiresAt = Date.now() + (payload.expires_in || 3600) * 1000
    return payload.access_token
  }

  async generate(account: Account, modelId: string, prompt: string): Promise<string> {
    const accessToken = await this.ensureAccessToken(account)
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    if (account.id) {
      headers["ChatGPT-Account-Id"] = account.id
    }

    let response: Response
    try {
      response = await this.fetcher(new URL(OPENAI_CHAT_COMPLETIONS_URL), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error: unknown) {
      throw ConduitError.from(error, "provider_unavailable")
    }

    if (response.status === 429) {
      throw new ConduitError("rate_limited", `Rate limit on OpenAI account ${account.email}`)
    }

    if (!response.ok) {
      throw new ConduitError("provider_rejected", `OpenAI returned HTTP ${response.status}.`)
    }

    const body = asObject(await response.json())
    const choices = Array.isArray(body?.choices) ? body.choices : []
    const firstChoice = asObject(choices[0])
    const message = asObject(firstChoice?.message)
    const content = message?.content

    if (typeof content !== "string" || !content) {
      throw new ConduitError("invalid_response", "OpenAI returned an empty response.")
    }

    return content
  }
}
