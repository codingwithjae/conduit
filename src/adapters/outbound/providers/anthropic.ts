import type { ModelProvider, ProviderModel } from "../../../application/ports/model-provider.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"
import { asObject, requestJson, type Fetcher } from "./http-json.js"

const ANTHROPIC_ORIGIN = "https://api.anthropic.com"
const ANTHROPIC_VERSION = "2023-06-01"

export class AnthropicProvider implements ModelProvider {
  readonly id = "anthropic" as const
  readonly credentialSource: string | null
  private readonly apiKey: string | undefined

  constructor(env: NodeJS.ProcessEnv = process.env, private readonly fetcher: Fetcher = fetch) {
    const key = env.ANTHROPIC_API_KEY?.trim()
    this.apiKey = key || undefined
    this.credentialSource = key ? "ANTHROPIC_API_KEY" : null
  }

  async listModels(): Promise<ProviderModel[]> {
    const apiKey = this.requireApiKey()
    const url = new URL("/v1/models", ANTHROPIC_ORIGIN)
    const body = await requestJson(this.id, this.fetcher, url, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        Accept: "application/json",
      },
    })

    if (!Array.isArray(body.data)) {
      throw new ConduitError("invalid_response", "Anthropic returned an invalid model catalog.")
    }

    return body.data.flatMap((entry) => {
      const model = asObject(entry)
      return typeof model?.id === "string"
        ? [{ id: model.id, provider: this.id, generationSupport: "supported" as const }]
        : []
    })
  }

  async generate(modelId: string, prompt: string): Promise<string> {
    const apiKey = this.requireApiKey()
    const url = new URL("/v1/messages", ANTHROPIC_ORIGIN)
    const body = await requestJson(this.id, this.fetcher, url, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    const contentBlocks = Array.isArray(body.content) ? body.content : []
    const text = contentBlocks.flatMap((block) => {
      const item = asObject(block)
      return item?.type === "text" && typeof item?.text === "string" ? [item.text] : []
    }).join("")

    if (!text) {
      throw new ConduitError("invalid_response", "Anthropic returned an empty response.")
    }
    return text
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new ConduitError("missing_credentials", "Configure ANTHROPIC_API_KEY to use Anthropic.")
    }
    return this.apiKey
  }
}
