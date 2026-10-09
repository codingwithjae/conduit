import type { ModelProvider, ProviderModel } from "../../../application/ports/model-provider.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"
import { asObject, requestJson, textParts, type Fetcher } from "./http-json.js"

const OPENAI_ORIGIN = "https://api.openai.com"

export class OpenAIProvider implements ModelProvider {
  readonly id = "openai" as const
  readonly credentialSource: string | null
  private readonly apiKey: string | undefined

  constructor(env: NodeJS.ProcessEnv = process.env, private readonly fetcher: Fetcher = fetch) {
    const key = env.OPENAI_API_KEY?.trim()
    this.apiKey = key || undefined
    this.credentialSource = key ? "OPENAI_API_KEY" : null
  }

  async listModels(): Promise<ProviderModel[]> {
    const apiKey = this.requireApiKey()
    const body = await requestJson(this.id, this.fetcher, new URL("/v1/models", OPENAI_ORIGIN), {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    })
    if (!Array.isArray(body.data)) {
      throw new ConduitError("invalid_response", "OpenAI returned an invalid model catalog.")
    }

    return body.data.flatMap((entry) => {
      const model = asObject(entry)
      return typeof model?.id === "string"
        ? [{ id: model.id, provider: this.id, generationSupport: "unknown" as const }]
        : []
    })
  }

  async generate(modelId: string, prompt: string): Promise<string> {
    const apiKey = this.requireApiKey()
    const body = await requestJson(this.id, this.fetcher, new URL("/v1/responses", OPENAI_ORIGIN), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: modelId, input: prompt }),
    })

    if (typeof body.output_text === "string" && body.output_text.length > 0) return body.output_text

    const output = Array.isArray(body.output) ? body.output : []
    const text = output.flatMap((item) => {
      const message = asObject(item)
      if (!Array.isArray(message?.content)) return []
      return message.content.flatMap((block) => {
        const content = asObject(block)
        return content?.type === "output_text" && typeof content.text === "string" ? [content.text] : []
      })
    }).join("")

    if (!text) throw new ConduitError("invalid_response", "OpenAI returned an empty response.")
    return text
  }

  private requireApiKey(): string {
    if (!this.apiKey) throw new ConduitError("missing_credentials", "Configure OPENAI_API_KEY in environment to use OpenAI.")
    return this.apiKey
  }
}
