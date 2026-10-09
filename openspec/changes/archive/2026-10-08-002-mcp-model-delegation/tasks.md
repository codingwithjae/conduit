# Tasks

## 1. Dependencias y contratos

- [x] 1.1 Añadir `@modelcontextprotocol/server` 2.3.1 y Zod 4, actualizar `pnpm-lock.yaml`; hecho cuando una instalación limpia y `pnpm run typecheck` pasan y compila el import de `serveStdio`.
- [x] 1.2 Definir contratos de providers, metadata de modelos y categorías de error; hecho cuando tests unitarios validan schemas estrictos, credenciales ausentes y confirmación sin hacer red.

## 2. Adapters oficiales de proveedores

- [x] 2.1 Implementar catálogo y Responses API de OpenAI con `fetch` inyectado; hecho cuando tests simulados verifican `data` sin cursores inventados, capability `unknown`, Authorization header-only (key ausente de URL/body), respuesta, rate limit sin failover, rechazo, redirect, timeout y redacción.
- [x] 2.2 Implementar catálogo paginado y `generateContent` de Gemini con `fetch` inyectado; hecho cuando tests simulados cubren `nextPageToken`/`pageToken`, filtro `generateContent`, ID canónico, precedencia de API keys, `x-goog-api-key` header-only (key ausente de URL/body), redirect, 429 sin failover, timeout, respuesta y errores sanitizados.

## 3. Herramientas y transporte MCP

- [x] 3.1 Registrar schemas estrictos de `provider_status` y `list_models`; hecho cuando pruebas modern/legacy verifican `server/discover` con `supportedVersions`, `tools/list`, `initialize`, `resultType` y cache hints por era, ausencia de API keys y cero requests al arrancar.
- [x] 3.2 Registrar `delegate_task` con `confirmExternalSend` y anotaciones de red; hecho cuando tests confirman que sin afirmación no hay request, modern devuelve `resultType: complete`, legacy no lo añade, solo se envía el prompt exacto y credenciales/prompts/errores no se registran.

## 4. CLI y documentación

- [x] 4.1 Añadir `conduit mcp serve`; hecho cuando pruebas de subproceso validan modern `server/discover` con version/caching, modern `tools/list` y `tools/call`, compatibilidad legacy `initialize`, stdout solo protocolario y cierre limpio por EOF/SIGINT/SIGTERM.
- [x] 4.2 Documentar variables de entorno, registro en clientes MCP, aprobación por llamada, transferencia exacta del prompt, cargos separados de suscripciones y limitaciones (sin OAuth, pools, cuotas, modos para el proveedor ni filesystem); hecho cuando un usuario puede configurarlo sin guardar claves en el repo/prompts y entiende que Conduit no verifica la aprobación humana.
- [x] 4.3 Ejecutar `openspec validate --strict`, typecheck, tests, build y smoke test con providers simulados; hecho cuando todo pasa sin credenciales reales ni llamadas facturables.
