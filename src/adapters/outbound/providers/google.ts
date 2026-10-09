import type { ModelProvider, ProviderModel } from "../../../application/ports/model-provider.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"
import { asObject, requestJson, textParts, type Fetcher } from "./http-json.js"

const GOOGLE_ORIGIN = "https://generativelanguage.googleapis.com"
const MAX_MODEL_PAGES = 20

export class GoogleProvider implements ModelProvider {
  readonly id = "google" as const
  readonly credentialSource: string | null
  private readonly apiKey: string | undefined

  constructor(env: NodeJS.ProcessEnv = process.env, private readonly fetcher: Fetcher = fetch) {
    const googleKey = env.GOOGLE_API_KEY?.trim()
    const geminiKey = env.GEMINI_API_KEY?.trim()
    this.apiKey = googleKey || geminiKey || undefined
    this.credentialSource = googleKey ? "GOOGLE_API_KEY" : geminiKey ? "GEMINI_API_KEY" : null
  }

  async listModels(): Promise<ProviderModel[]> {
    const apiKey = this.requireApiKey()
    const models: ProviderModel[] = []
    const seenTokens = new Set<string>()
    let pageToken: string | undefined

    for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
      const url = new URL("/v1beta/models", GOOGLE_ORIGIN)
      url.searchParams.set("pageSize", "100")
      if (pageToken) url.searchParams.set("pageToken", pageToken)

      const body = await requestJson(this.id, this.fetcher, url, {
        headers: { "x-goog-api-key": apiKey, Accept: "application/json" },
      })
      if (!Array.isArray(body.models)) {
        throw new ConduitError("invalid_response", "Google returned an invalid model catalog.")
      }

      for (const entry of body.models) {
        const model = asObject(entry)
        if (typeof model?.name !== "string" || !Array.isArray(model.supportedGenerationMethods)) continue
        if (!model.supportedGenerationMethods.includes("generateContent")) continue
        const id = model.name.replace(/^models\//, "")
        if (!id || id.includes("/")) continue
        models.push({ id, provider: this.id, generationSupport: "supported" })
      }

      if (typeof body.nextPageToken !== "string" || body.nextPageToken.length === 0) return models
      if (seenTokens.has(body.nextPageToken)) {
        throw new ConduitError("invalid_response", "Google repeated a pagination token.")
      }
      seenTokens.add(body.nextPageToken)
      pageToken = body.nextPageToken
    }

    throw new ConduitError("invalid_response", "Google model catalog exceeded safe page limit.")
  }

  async generate(modelId: string, prompt: string): Promise<string> {
    const apiKey = this.requireApiKey()
    const modelSegment = encodeURIComponent(modelId)
    const url = new URL(`/v1beta/models/${modelSegment}:generateContent`, GOOGLE_ORIGIN)
    const body = await requestJson(this.id, this.fetcher, url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
    })

    const candidates = Array.isArray(body.candidates) ? body.candidates : []
    const firstCandidate = asObject(candidates[0])
    const content = asObject(firstCandidate?.content)
    const text = textParts(content?.parts).join("")
    if (!text) throw new ConduitError("invalid_response", "Google returned an empty response.")
    return text
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new ConduitError("missing_credentials", "Configure GOOGLE_API_KEY or GEMINI_API_KEY to use Gemini.")
    }
    return this.apiKey
  }
}
