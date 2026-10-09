# Proposal

## Why

Conduit actualmente solo soporta OpenAI y Google Gemini. Para permitir que desarrolladores y agentes de terminal utilicen el espectro completo de modelos líderes (Claude de Anthropic, cientos de modelos abiertos y comerciales vía OpenRouter, razonamiento económico con DeepSeek, baja latencia con Groq y privacidad local sin coste con Ollama), se requiere extender el motor de proveedores sin duplicar código ni comprometer la arquitectura limpia.

## What Changes

- Añadir `AnthropicProvider` dedicado para la Messages API oficial (`https://api.anthropic.com/v1/messages`) con autenticación mediante `ANTHROPIC_API_KEY`.
- Añadir `OpenAICompatibleProvider` genérico y reutilizable para proveedores que siguen el estándar Chat Completions de OpenAI.
- Registrar adaptadores específicos basados en la clase genérica para:
  - OpenRouter (`https://openrouter.ai/api/v1` vía `OPENROUTER_API_KEY`).
  - DeepSeek (`https://api.deepseek.com/v1` vía `DEEPSEEK_API_KEY`).
  - Groq (`https://api.groq.com/openai/v1` vía `GROQ_API_KEY`).
  - Ollama (`OLLAMA_BASE_URL`, por ejemplo `http://localhost:11434/v1`, sin API key obligatoria).
- Actualizar `provider_status`, `list_models` y `delegate_task` en el servidor MCP para reconocer y validar los 7 proveedores (`openai`, `google`, `anthropic`, `openrouter`, `deepseek`, `groq`, `ollama`).
- Mantener la política constitucional P5: las claves se envían exclusivamente en headers HTTPS, nunca en URLs ni logs; las redirecciones se rechazan; se exige confirmación explícita `confirmExternalSend: true`.

## Goals and Non-Goals

### Goals
- Soporte CLI/TUI y MCP para 5 nuevos proveedores oficiales o compatibles.
- Descubrimiento dinámico de modelos desde los endpoints oficiales de cada proveedor con caché de 5 minutos.
- Integración de Ollama condicionada estrictamente a la existencia de `OLLAMA_BASE_URL`.

### Non-Goals
- No implementar gestión de cuentas de suscripción OAuth en esta propuesta.
- No implementar streaming de respuestas ni interfaces gráficas.
- No alterar ni filtrar catálogos de OpenRouter con listas blancas rígidas.

### Policy and Security Risks
- OpenRouter, DeepSeek y Groq son servicios comerciales externos de pago por token; `delegate_task` debe continuar declarando explícitamente el proveedor y posible coste de API.
- Ollama ejecuta modelos localmente; las peticiones a `OLLAMA_BASE_URL` deben validar que la URL sea válida y no redirija a orígenes no autorizados.

## Capabilities

### New Capabilities
Ninguna.

### Modified Capabilities
- `mcp-model-delegation`: Expande la lista de proveedores soportados a `openai`, `google`, `anthropic`, `openrouter`, `deepseek`, `groq` y `ollama`, incorporando adaptadores para la Messages API de Anthropic y proveedores compatibles con OpenAI.

## Impact

- `src/application/ports/model-provider.ts`: Ampliación del array `providerIds` y tipos asociados.
- `src/adapters/outbound/providers/`: Nuevos adaptadores `anthropic.ts`, `openai-compatible.ts`, y actualización de `registry.ts`.
- `src/adapters/inbound/mcp/server.ts`: Schemas de Zod y herramientas actualizadas para admitir los nuevos identificadores de proveedor.
- `tests/`: Nuevas suites de pruebas unitarias para Anthropic, proveedores compatibles y pruebas de integración MCP.
