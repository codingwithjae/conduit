import type { ModelProvider, ProviderId, ProviderModel } from "../../../application/ports/model-provider.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"
import { asObject, requestJson, type Fetcher } from "./http-json.js"

export interface OpenAICompatibleOptions {
  id: ProviderId
  baseUrl: string
  credentialEnvVar?: string
  authHeaderType?: "bearer" | "none"
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: ProviderId
  readonly credentialSource: string | null
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly authHeaderType: "bearer" | "none"

  constructor(
    options: OpenAICompatibleOptions,
    env: NodeJS.ProcessEnv = process.env,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.id = options.id
    this.authHeaderType = options.authHeaderType ?? "bearer"

    if (this.id === "ollama") {
      const url = env.OLLAMA_BASE_URL?.trim()
      this.baseUrl = (url || options.baseUrl).replace(/\/+$/, "")
      this.credentialSource = url ? "OLLAMA_BASE_URL" : null
      this.apiKey = undefined
    } else {
      this.baseUrl = options.baseUrl.replace(/\/+$/, "")
      const envVar = options.credentialEnvVar
      const key = envVar ? env[envVar]?.trim() : undefined
      this.apiKey = key || undefined
      this.credentialSource = key && envVar ? envVar : null
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    this.assertConfigured()
    const headers = this.buildHeaders()
    const url = new URL(`${this.baseUrl}/models`)
    const body = await requestJson(this.id, this.fetcher, url, { headers })

    if (!Array.isArray(body.data)) {
      throw new ConduitError("invalid_response", `${this.id} returned an invalid model catalog.`)
    }

    return body.data.flatMap((entry) => {
      const model = asObject(entry)
      return typeof model?.id === "string"
        ? [{ id: model.id, provider: this.id, generationSupport: "unknown" as const }]
        : []
    })
  }

  async generate(modelId: string, prompt: string): Promise<string> {
    this.assertConfigured()
    const headers = {
      ...this.buildHeaders(),
      "Content-Type": "application/json",
    }
    const url = new URL(`${this.baseUrl}/chat/completions`)
    const body = await requestJson(this.id, this.fetcher, url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    const choices = Array.isArray(body.choices) ? body.choices : []
    const firstChoice = asObject(choices[0])
    const message = asObject(firstChoice?.message)
    const content = message?.content

    if (typeof content !== "string" || !content) {
      throw new ConduitError("invalid_response", `${this.id} returned an empty response.`)
    }
    return content
  }

  private assertConfigured(): void {
    if (this.id === "ollama") {
      if (!this.credentialSource) {
        throw new ConduitError("missing_credentials", "Configure OLLAMA_BASE_URL to use Ollama.")
      }
    } else if (!this.apiKey) {
      const varName = this.credentialSource || (this.id === "openrouter" ? "OPENROUTER_API_KEY" : this.id === "deepseek" ? "DEEPSEEK_API_KEY" : "GROQ_API_KEY")
      throw new ConduitError("missing_credentials", `Configure ${varName} to use ${this.id}.`)
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (this.authHeaderType === "bearer" && this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`
    }
    return headers
  }
}
