# Design

## Context

Consulta `proposal.md` para el problema y `specs/mcp-model-delegation/spec.md` para el contrato observable. Conduit ya tiene un binario ESM compilado y una capa de entrada CLI. La constitución permite enviar solo el prompt explícito aprobado y exige proveedores oficiales, separación de capas y protección de credenciales.

## Goals / Non-Goals

**Goals:**

- Ejecutar MCP por `stdio` desde `conduit mcp serve`, sin lanzar otra CLI de agente.
- Proveer descubrimiento dinámico y delegación de texto con adapters independientes para OpenAI y Gemini API.
- Mantener `ask`, `plan`, `code` y `debug` en el agente anfitrión; el MCP no añade instrucciones al prompt.
- Facilitar tests unitarios con providers y transporte sustituibles, sin credenciales ni requests reales.

**Non-Goals:**

- No usar OAuth de suscripciones, endpoints privados, APIs internas ni tokens de otras CLI.
- No almacenar API keys, gestionar múltiples cuentas, mostrar cuotas, ni rotar/reintentar otra cuenta ante 429.
- No permitir acceso a archivos, ejecución de shell, herramientas del modelo ni cambios en el repositorio anfitrión.
- No añadir HTTP/SSE, streaming, modos de agente en el proveedor ni GUI en este cambio.

## Decisions

### SDK MCP dual-era sobre stdio

Usar `@modelcontextprotocol/server` 2.3.1 y Zod 4. Importar `McpServer` desde `@modelcontextprotocol/server` y `serveStdio` desde `@modelcontextprotocol/server/stdio`; registrar herramientas con `registerTool` dentro de una factory. No conectar manualmente `McpServer` a `StdioServerTransport`, porque eso sirve solo el protocolo 2025-era.

`serveStdio` atiende por defecto ambos eras: modern 2026-07-28 con metadata en cada solicitud y `server/discover` (sin `initialize`), y legacy 2025-era con `initialize`/`notifications/initialized`. En modern las solicitudes son stateless; los handlers no infieren capacidades o identidad de peticiones anteriores. El SDK gestiona `resultType`, server identity y framing JSON-RPC; `resultType: "complete"` aparece solo en respuestas modern y se omite en legacy.

Los resultados modern cacheables de `server/discover` y `tools/list` se configuran mediante `ServerOptions.cacheHints` con TTL de 300.000 ms y `cacheScope: "public"`, porque capacidades y schemas son iguales para todos los callers. El SDK agrega `resultType: "complete"` y esos hints. En respuestas legacy, el SDK mantiene el wire format de 2025 y no agrega `resultType`.

### Puertos de proveedor con fetch de Node

Definir un contrato pequeño (`listModels`, `delegateTask`) y adapters OpenAI/Gemini que usen `fetch` global de Node, inyectado para facilitar pruebas. No se añaden SDKs de proveedor en este primer corte. La composición conecta los adapters a variables de entorno; nunca se pasan keys como argumentos MCP.

- OpenAI: `GET https://api.openai.com/v1/models` (procesa su array `data`, sin cursores inventados) y `POST https://api.openai.com/v1/responses`; API key en `Authorization: Bearer`.
- Gemini Developer API: `GET https://generativelanguage.googleapis.com/v1beta/models`, enviando `nextPageToken` como `pageToken`, y `POST .../models/{id}:generateContent`; API key en `x-goog-api-key`. `GOOGLE_API_KEY` tiene prioridad sobre `GEMINI_API_KEY`.
- Las URLs son constantes oficiales. `redirect: "error"` impide reenviar credenciales a otro origen. No se permiten base URLs ni headers suministrados por el cliente. El segmento Gemini se codifica después de validar el ID contra el catálogo.

### Catálogo dinámico con caché visible

`list_models` consulta el catálogo oficial solo cuando se invoca. Mantiene en memoria una caché de cinco minutos por proveedor y devuelve `fetchedAt`, `cacheAgeSeconds` y `cacheTtlSeconds`. Si una actualización expirada falla, devuelve error en vez de presentar datos obsoletos como actuales. OpenAI se lista con capacidad `unknown` porque `/v1/models` no garantiza generación; Gemini se filtra por `generateContent` y el ID se normaliza sin el prefijo de recurso `models/`. La delegación exige un ID del catálogo reciente; un alias `latest` queda fuera. Los modelos OpenAI con capacidad `unknown` pueden intentarse explícitamente y el proveedor puede rechazarlos.

### Herramientas MCP pequeñas y schemas estrictos

- `provider_status`: objeto de entrada vacío; devuelve providers configurados, variable seleccionada y `configured`, sin verificar la key.
- `list_models`: requiere `provider` (`openai` o `google`) y devuelve un bloque de texto JSON más `structuredContent` con catálogo y frescura.
- `delegate_task`: acepta solo `provider`, `model`, `prompt` y `confirmExternalSend`; rechaza argumentos desconocidos. La confirmación es opcional en el schema para que el handler pueda devolver `consent_required` si falta o es `false`.

Los schemas son estrictos y usan Zod 4. Los resultados modernos incluyen `resultType: "complete"` mediante el SDK; los resultados legacy conservan el formato 2025. El resultado de `delegate_task` es `{provider, model, text}`; los errores usan `{code, message}` y `isError: true`.

### Delegación explícita: prompt literal y aprobación

`delegate_task` se registra con anotaciones MCP `openWorldHint: true`, `readOnlyHint: false`; su descripción informa que envía el prompt al proveedor elegido y que la API puede cobrar por uso. El host debe pedir aprobación por llamada y mostrar proveedor, modelo y prompt; no debe auto-aprobar. `confirmExternalSend: true` es una afirmación del cliente, no prueba de quién la estableció. El host mantiene los modos `ask`/`plan`/`code`/`debug`, pero no los envía en este cambio. La herramienta no recibe archivos ni contexto de sesión.

### Errores y límites de petición

Las llamadas de proveedor tienen timeout de 60 segundos y no reintentan con otra cuenta. Se usan categorías estables (`missing_credentials`, `rate_limited`, `provider_rejected`, `provider_unavailable`, `invalid_response`, `consent_required`, `unknown_model`, `redirect_blocked`). No se retornan ni registran cuerpos HTTP, URLs, headers, prompts, excepciones o stack traces. La respuesta generada solo se devuelve como resultado de la llamada autorizada.

### Pruebas sin gasto

Las pruebas inyectan `fetch` simulado y un registry de providers falso. Se prueba `serveStdio` como subproceso para descubrimiento modern y handshake legacy; las pruebas de adapters usan respuestas simuladas y nunca requieren keys ni consumen cuota.

## Risks / Trade-offs

- [El catálogo OpenAI incluye modelos sin generación verificada] → mostrar `generationSupport: unknown`; permitir intento solo con ID del catálogo y reportar el rechazo del proveedor.
- [Las llamadas son facturables y Conduit no estima ni limita gasto] → divulgarlo en metadata y documentación antes de que se habilite el tool en un cliente.
- [Un MCP host puede auto-aprobar herramientas] → marcar el tool como acción de mundo abierto/no solo-lectura, exigir la afirmación de consentimiento y documentar aprobación por llamada; Conduit no puede verificar la acción humana.
- [La API cambia respuestas] → parsing mínimo y tests con fixtures anonimizados.
- [No existe cuota uniforme en APIs oficiales] → no inferir cuotas ni ofrecer rotación en este cambio.
- [SDK MCP v2 cambia respecto a ejemplos legacy] → fijar v2.3.1 y probar ambos eras con los entrypoints documentados.

## Migration Plan

No hay migración de datos. Configurar `OPENAI_API_KEY` y/o `GOOGLE_API_KEY` (`GEMINI_API_KEY` como fallback) en el entorno del proceso MCP y registrar `conduit mcp serve` en el cliente. Sin keys, el servidor inicia y `provider_status` indica que no están configuradas. Para rollback, quitar el servidor MCP del cliente; no hay estado persistente que migrar.
