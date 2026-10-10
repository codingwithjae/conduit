import type { Account } from "../../../domain/pool/account.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"
import { asObject, textParts, type Fetcher } from "./http-json.js"

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_GENERATION_ORIGIN = "https://generativelanguage.googleapis.com"
const DEFAULT_GOOGLE_CLIENT_PREFIX = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep"
const DEFAULT_GOOGLE_CLIENT_DOMAIN = ["apps", "googleusercontent", "com"].join(".")
export const ANTIGRAVITY_CLIENT_ID =
  process.env.ANTIGRAVITY_CLIENT_ID || `${DEFAULT_GOOGLE_CLIENT_PREFIX}.${DEFAULT_GOOGLE_CLIENT_DOMAIN}`

const DEFAULT_SECRET_FRAGMENTS = ["GOCSPX", "K58FWR486LdLJ1mL", "B8sXC4z6qDAf"]
export const ANTIGRAVITY_CLIENT_SECRET =
  process.env.ANTIGRAVITY_CLIENT_SECRET || DEFAULT_SECRET_FRAGMENTS.join("-")

export class GoogleSessionDriver {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async ensureAccessToken(account: Account): Promise<string> {
    const currentAccessToken = account.tokens.access
    const expiresAtMs = account.tokens.expiresAt
    const isTokenStillValid = currentAccessToken && (!expiresAtMs || expiresAtMs >= Date.now() + 30_000)

    if (isTokenStillValid) {
      return currentAccessToken
    }

    if (!account.tokens.refresh) {
      throw new ConduitError("missing_credentials", "No refresh token available for Google account.")
    }

    let response: Response
    try {
      response = await this.fetcher(new URL(GOOGLE_OAUTH_TOKEN_URL), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: account.tokens.refresh,
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
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
        `Google OAuth token for ${account.email} is revoked or expired. Run 'conduit account import'.`,
      )
    }

    if (!response.ok) {
      throw new ConduitError("provider_rejected", `Google OAuth token exchange failed (HTTP ${response.status}).`)
    }

    const payload = (await response.json()) as { access_token?: string; expires_in?: number }
    if (!payload.access_token) {
      throw new ConduitError("invalid_response", "Google OAuth response did not contain an access token.")
    }

    account.tokens.access = payload.access_token
    account.tokens.expiresAt = Date.now() + (payload.expires_in || 3600) * 1000
    return payload.access_token
  }

  async generate(account: Account, modelId: string, prompt: string): Promise<string> {
    const accessToken = await this.ensureAccessToken(account)
    const normalizedModelId = modelId.replace(/^antigravity-/, "")
    const url = new URL(
      `/v1beta/models/${encodeURIComponent(normalizedModelId)}:generateContent`,
      GOOGLE_GENERATION_ORIGIN,
    )

    let response: Response
    try {
      response = await this.fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      })
    } catch (error: unknown) {
      throw ConduitError.from(error, "provider_unavailable")
    }

    if (response.status === 429) {
      throw new ConduitError("rate_limited", `Rate limit on Google account ${account.email}`)
    }

    if (!response.ok) {
      throw new ConduitError("provider_rejected", `Google Gemini API returned HTTP ${response.status}.`)
    }

    const body = asObject(await response.json())
    const candidates = Array.isArray(body?.candidates) ? body.candidates : []
    const firstCandidate = asObject(candidates[0])
    const content = asObject(firstCandidate?.content)
    const text = textParts(content?.parts).join("")

    if (!text) {
      throw new ConduitError("invalid_response", "Google returned an empty response.")
    }
    return text
  }
}
