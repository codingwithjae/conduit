# Tasks

## 1. Contratos y tipos

- [x] 1.1 Extender `ProviderId` y `providerIds` en `src/application/ports/model-provider.ts` con `anthropic`, `openrouter`, `deepseek`, `groq` y `ollama`; hecho cuando `pnpm run typecheck` compila con los nuevos tipos.

## 2. Adaptador genérico compatible con OpenAI

- [x] 2.1 Implementar `OpenAICompatibleProvider` en `src/adapters/outbound/providers/openai-compatible.ts` soportando Bearer auth y no-auth para `listModels` y `generate` (Chat Completions); hecho cuando tests unitarios en `tests/providers/openai-compatible.test.ts` verifican OpenRouter, DeepSeek, Groq y Ollama con `fetch` inyectado.

## 3. Adaptador dedicado de Anthropic

- [x] 3.1 Implementar `AnthropicProvider` en `src/adapters/outbound/providers/anthropic.ts` para `GET /v1/models` y `POST /v1/messages` con headers `x-api-key` y `anthropic-version: 2023-06-01`; hecho cuando tests unitarios en `tests/providers/anthropic.test.ts` cubren catálogo, generación, errores y redacción de secretos.

## 4. Registro y herramientas MCP

- [x] 4.1 Actualizar `createProviderRegistry` en `src/adapters/outbound/providers/registry.ts` y los schemas de Zod en `src/adapters/inbound/mcp/server.ts` para registrar los 7 proveedores; hecho cuando tests en `tests/mcp/server.protocol.test.ts` y `tests/application/model-service.test.ts` validan `provider_status`, `list_models` y `delegate_task` para los nuevos proveedores.

## 5. Documentación y validación final

- [x] 5.1 Actualizar `docs/mcp-server.md` con las variables de entorno de los nuevos proveedores (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OLLAMA_BASE_URL`) y ejemplos; hecho cuando los comandos y variables documentados coinciden con el código.
- [x] 5.2 Ejecutar `openspec validate --strict`, typecheck, tests y build; hecho cuando todas las suites pasan al 100% sin credenciales reales.
