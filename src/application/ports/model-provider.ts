export const providerIds = [
  "openai",
  "google",
  "anthropic",
  "openrouter",
  "deepseek",
  "groq",
  "ollama",
] as const

export type ProviderId = (typeof providerIds)[number]
export type GenerationSupport = "supported" | "unknown"

export interface ProviderModel {
  id: string
  provider: ProviderId
  generationSupport: GenerationSupport
}

export interface ModelProvider {
  readonly id: ProviderId
  readonly credentialSource: string | null
  listModels(): Promise<ProviderModel[]>
  generate(modelId: string, prompt: string): Promise<string>
}
