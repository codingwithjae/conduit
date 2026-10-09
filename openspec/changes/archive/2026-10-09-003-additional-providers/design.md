# Design

## Context

Consulta `proposal.md` para la motivación y `specs/mcp-model-delegation/spec.md` para los contratos observables. Conduit actualmente implementa el puerto `ModelProvider` para OpenAI y Google. Este cambio añade cinco nuevos proveedores conservando la arquitectura hexagonal limpia y las garantías de seguridad de la constitución P5.

## Goals / Non-Goals

**Goals:**
- Implementar un adaptador genérico `OpenAICompatibleProvider` para OpenRouter, DeepSeek, Groq y Ollama sin duplicación de código.
- Implementar un adaptador dedicado `AnthropicProvider` para la Messages API oficial.
- Registrar los 7 proveedores en `createProviderRegistry` y actualizar las herramientas y esquemas MCP.
- Mantener cobertura de tests unitarios e integración completa mediante `fetch` inyectado y sin requerir credenciales reales en pruebas.

**Non-Goals:**
- No implementar flujos de autenticación OAuth de suscripciones ni gestión de pools multi-cuenta en esta propuesta.
- No permitir que clientes MCP especifiquen URLs base arbitrarias en los argumentos de las herramientas.
- No implementar streaming de tokens ni interfaces gráficas.

## Decisions

### 1. Adaptador genérico `OpenAICompatibleProvider`
OpenRouter, DeepSeek, Groq y Ollama comparten el estándar de facto de OpenAI:
- Catálogo: `GET {baseUrl}/models` (procesando el array `data`).
- Inferencia: `POST {baseUrl}/chat/completions` con `{ model, messages: [{ role: "user", content: prompt }] }`.
- Extracción de respuesta: `choices[0].message.content`.

La clase `OpenAICompatibleProvider` abstrae esta lógica recibiendo:
```typescript
interface OpenAICompatibleConfig {
  id: ProviderId
  baseUrl: string
  credentialEnvVar?: string
  authHeaderType?: "bearer" | "none"
}
```
*Alternativas consideradas:* Crear 4 clases independientes (`OpenRouterProvider`, `DeepSeekProvider`, etc.), descartado por generar duplicación innecesaria de más del 90% de la lógica HTTP.

### 2. Adaptador dedicado `AnthropicProvider`
Anthropic utiliza endpoints y estructuras específicas que no siguen el esquema Chat Completions:
- Catálogo: `GET https://api.anthropic.com/v1/models` (array `data`).
- Inferencia: `POST https://api.anthropic.com/v1/messages`.
- Headers obligatorios: `x-api-key: {key}` y `anthropic-version: 2023-06-01`.
- Body: `{ model, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }`.
- Extracción: Concatenación de bloques en `content[]` con `type: "text"`.

### 3. Configuración y activación de Ollama
Ollama corre como servidor local y no requiere API keys. Se configura mediante `OLLAMA_BASE_URL` (por ejemplo `http://localhost:11434/v1`).
- Si `OLLAMA_BASE_URL` está definido en el entorno, `provider_status` reporta `configured: true` con `credentialSource: "OLLAMA_BASE_URL"`.
- Si `OLLAMA_BASE_URL` no está definido, reporta `configured: false` y `list_models` devuelve `missing_credentials`.
- Se usa `OpenAICompatibleProvider` con `authHeaderType: "none"`.

### 4. Endpoints y seguridad de transporte
- Orígenes fijos oficiales para proveedores cloud:
  - Anthropic: `https://api.anthropic.com`
  - OpenRouter: `https://openrouter.ai`
  - DeepSeek: `https://api.deepseek.com`
  - Groq: `https://api.groq.com`
- En todos los casos se impone `redirect: "manual"` (para bloquear redirecciones que pudieran exponer credenciales) y timeout de 60 segundos por solicitud.

## Risks / Trade-offs

- **[Volumen del catálogo de OpenRouter]** → OpenRouter expone cientos de modelos. La consulta se cachea durante 5 minutos en memoria conforme a la especificación; se devuelve el catálogo completo estructurado.
- **[Ollama local no disponible o apagado]** → Si la URL de Ollama está configurada pero el servidor local no está corriendo, la solicitud falla de forma controlada y `safeToolError` mapea el error a `provider_unavailable`.
- **[Límites de tokens de contexto en modelos pequeños]** → Las solicitudes envían únicamente el prompt del usuario sin inyección de contexto implícito. Si el proveedor rechaza por exceso de tamaño, se mapea a `provider_rejected`.

## Migration Plan

La ampliación es aditiva y totalmente compatible con las implementaciones previas.
- Las variables de entorno de OpenAI y Google (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`) siguen funcionando exactamente igual.
- Nuevas variables reconocidas: `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OLLAMA_BASE_URL`.
