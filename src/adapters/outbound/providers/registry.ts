import type { ModelProvider } from "../../../application/ports/model-provider.js"
import { AnthropicProvider } from "./anthropic.js"
import { GoogleProvider } from "./google.js"
import { OpenAIProvider } from "./openai.js"
import { OpenAICompatibleProvider } from "./openai-compatible.js"
import type { Fetcher } from "./http-json.js"

export const createProviderRegistry = (
  env: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): ModelProvider[] => [
  new OpenAIProvider(env, fetcher),
  new GoogleProvider(env, fetcher),
  new AnthropicProvider(env, fetcher),
  new OpenAICompatibleProvider(
    { id: "openrouter", baseUrl: "https://openrouter.ai/api/v1", credentialEnvVar: "OPENROUTER_API_KEY" },
    env,
    fetcher,
  ),
  new OpenAICompatibleProvider(
    { id: "deepseek", baseUrl: "https://api.deepseek.com/v1", credentialEnvVar: "DEEPSEEK_API_KEY" },
    env,
    fetcher,
  ),
  new OpenAICompatibleProvider(
    { id: "groq", baseUrl: "https://api.groq.com/openai/v1", credentialEnvVar: "GROQ_API_KEY" },
    env,
    fetcher,
  ),
  new OpenAICompatibleProvider(
    { id: "ollama", baseUrl: "http://localhost:11434/v1", authHeaderType: "none" },
    env,
    fetcher,
  ),
]
