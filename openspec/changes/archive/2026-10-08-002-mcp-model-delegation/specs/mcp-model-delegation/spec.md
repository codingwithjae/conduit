# Spec Delta

## Purpose

Exponer un servidor MCP stdio pequeño e independiente del agente anfitrión para descubrir los modelos disponibles en APIs oficiales y delegar tareas de texto autorizadas.

## ADDED Requirements

### Requirement: MCP dual-era sobre stdio

The system SHALL proporcionar `conduit mcp serve` mediante `serveStdio` del SDK oficial y soportar clientes MCP modernos (2026-07-28) y legacy (2025-era).

#### Scenario: Descubrimiento moderno
- **WHEN** un cliente moderno envía `server/discover` con metadata `_meta` válida
- **THEN** el servidor responde con `resultType: complete`, `supportedVersions: ["2026-07-28"]`, capacidad `tools`, identidad en `_meta` y hints de caché

#### Scenario: Hints de cache de descubrimiento
- **WHEN** un cliente moderno envía `server/discover`
- **THEN** la respuesta incluye `ttlMs: 300000` y `cacheScope: public`

#### Scenario: Llamada moderna sin handshake
- **WHEN** un cliente moderno envía `tools/list` con metadata por solicitud sin haber enviado `initialize`
- **THEN** el servidor procesa la solicitud de forma stateless y no depende de metadata almacenada de solicitudes anteriores

#### Scenario: Compatibilidad con cliente legacy
- **WHEN** un cliente legacy inicia con `initialize` y continúa con `notifications/initialized`
- **THEN** `serveStdio` atiende la conexión con semántica legacy y permite `tools/list`/`tools/call`

#### Scenario: Lista de herramientas moderna cacheable
- **WHEN** un cliente moderno solicita `tools/list`
- **THEN** el resultado completo incluye `resultType: complete`, `ttlMs: 300000` y `cacheScope: public`

#### Scenario: Resultado moderno de llamada a herramienta
- **WHEN** una llamada moderna a `tools/call` termina correctamente
- **THEN** la respuesta MCP incluye `resultType: complete`; una respuesta de herramienta con error usa `isError: true`

#### Scenario: Resultado de llamada legacy
- **WHEN** una llamada `tools/call` se atiende en el era legacy
- **THEN** el SDK conserva el formato 2025 y no añade `resultType` de la revisión moderna

#### Scenario: Metadata moderna incompleta
- **WHEN** un cliente moderno omite un campo `_meta` obligatorio para una solicitud
- **THEN** el SDK rechaza la solicitud con un error de parámetros inválidos antes de ejecutar un handler de Conduit

#### Scenario: Schemas de herramientas
- **WHEN** el cliente solicita `tools/list` en cualquiera de las eras soportadas
- **THEN** recibe schemas para `provider_status`, `list_models` y `delegate_task`

#### Scenario: Llamada con argumento fuera del schema
- **WHEN** el cliente MCP incluye parámetros no permitidos por el schema de una herramienta
- **THEN** Conduit rechaza la llamada antes de contactar al proveedor

#### Scenario: Salida de protocolo limpia
- **WHEN** el servidor inicia o atiende una solicitud
- **THEN** stdout contiene únicamente mensajes MCP y los diagnósticos se escriben en stderr

#### Scenario: Inicio sin llamadas a proveedores
- **WHEN** el servidor inicia o responde a `server/discover`/`tools/list`
- **THEN** no realiza solicitudes de red a ningún proveedor

#### Scenario: Cierre del transporte
- **WHEN** el cliente cierra stdin o el proceso recibe SIGINT/SIGTERM
- **THEN** el servidor cierra el transporte MCP y termina sin procesos secundarios

### Requirement: Estado seguro de proveedores

The system SHALL informar si hay credenciales configuradas para cada proveedor soportado sin verificar ni revelar sus valores.

`provider_status` SHALL aceptar un objeto vacío y devolver un bloque de texto estructurado con `provider`, `configured` y `credentialSource` para cada proveedor. `credentialSource` puede ser el nombre de una variable de entorno, nunca su valor.

#### Scenario: API keys configuradas
- **WHEN** el cliente MCP llama `provider_status`
- **THEN** la respuesta indica si OpenAI y Google están configurados, el nombre de la variable seleccionada y que su validez no fue comprobada

#### Scenario: Ninguna API key configurada
- **WHEN** no existe ninguna variable de entorno soportada con valor no vacío
- **THEN** el servidor sigue disponible y `provider_status` informa que ambos proveedores no están configurados

#### Scenario: Alias de API key de Google
- **WHEN** `GOOGLE_API_KEY` y `GEMINI_API_KEY` tienen valores no vacíos
- **THEN** Conduit selecciona `GOOGLE_API_KEY` e informa ese nombre sin mostrar ninguno de los valores

### Requirement: Descubrimiento de modelos actuales y capacidades

The system SHALL obtener modelos del catálogo oficial del proveedor seleccionado y exponer la certeza de sus capacidades y la frescura del catálogo.

`list_models` SHALL aceptar un objeto con `provider` (`openai` o `google`) y devolver una lista de objetos con `id`, `provider`, `generationSupport`, `fetchedAt`, `cacheAgeSeconds` y `cacheTtlSeconds`.

#### Scenario: Listar modelos de un proveedor configurado
- **WHEN** el cliente MCP llama `list_models` para OpenAI o Google con una API key configurada
- **THEN** la respuesta contiene objetos con `id`, `provider`, `generationSupport`, `fetchedAt`, `cacheAgeSeconds` y `cacheTtlSeconds`

#### Scenario: Capacidad OpenAI desconocida
- **WHEN** el catálogo de OpenAI no confirma que un modelo admita generación de texto
- **THEN** Conduit informa la capacidad como `unknown` en vez de afirmar que el modelo soporta Responses API

#### Scenario: Capacidad Gemini confirmada
- **WHEN** Conduit lee el catálogo oficial de Google
- **THEN** incluye solo modelos cuyo metadata enumera `generateContent`, devuelve el ID sin el prefijo `models/` y marca esa capacidad como soportada

#### Scenario: Catálogo OpenAI sin cursores
- **WHEN** Conduit consulta el endpoint oficial `/v1/models` de OpenAI
- **THEN** procesa el array `data` devuelto y no inventa paginación por `has_more` o `last_id`

#### Scenario: Catálogo en caché vigente
- **WHEN** el catálogo fue obtenido hace no más de cinco minutos
- **THEN** `list_models` puede devolverlo con metadata visible de frescura

#### Scenario: Catálogo en caché vencido
- **WHEN** el catálogo tiene más de cinco minutos
- **THEN** `list_models` lo actualiza desde la API oficial antes de presentarlo como vigente

#### Scenario: Error al actualizar catálogo
- **WHEN** falla la actualización de un catálogo vencido
- **THEN** `list_models` devuelve un error sanitizado y no presenta datos vencidos como actuales

#### Scenario: Catálogo sin credencial
- **WHEN** `list_models` se llama para un proveedor sin API key configurada
- **THEN** devuelve `missing_credentials` y no realiza ninguna solicitud de red

### Requirement: Delegación explícita de tareas de texto

The system SHALL enviar al proveedor seleccionado únicamente el prompt explícito de `delegate_task` cuando la llamada indique confirmación de transferencia.

La entrada de `delegate_task` SHALL aceptar exactamente `provider` (`openai` o `google`), `model` (ID devuelto por `list_models`), `prompt` (1–100.000 caracteres) y `confirmExternalSend` (booleano opcional). La llamada solo se ejecuta si el booleano es `true`; no acepta API keys, URLs, headers ni texto de instrucciones adicional.

#### Scenario: Delegación confirmada
- **WHEN** `delegate_task` recibe proveedor soportado, ID exacto de modelo, prompt no vacío y `confirmExternalSend: true`
- **THEN** Conduit envía solo ese prompt sin instrucciones añadidas y devuelve el proveedor, modelo y texto generado

#### Scenario: Delegación no confirmada
- **WHEN** falta `confirmExternalSend` o su valor es `false`
- **THEN** Conduit devuelve `consent_required` y no realiza una solicitud al proveedor

#### Scenario: Aviso de transferencia y coste
- **WHEN** un cliente MCP lista la herramienta `delegate_task`
- **THEN** su descripción informa que el prompt se enviará al proveedor/modelo seleccionado, que puede generar cargos API separados de una suscripción y que Conduit no estima precio ni limita gasto

#### Scenario: Aprobación humana en el host
- **WHEN** un cliente configura Conduit para usar `delegate_task`
- **THEN** debe pedir aprobación humana por llamada y mostrar proveedor, modelo exacto y prompt; si no puede hacerlo, no debe habilitar la herramienta

#### Scenario: Confirmación como afirmación del cliente
- **WHEN** `confirmExternalSend` es `true`
- **THEN** Conduit lo trata como afirmación del cliente MCP y no afirma que el servidor pueda verificar quién la estableció

#### Scenario: Sin contexto local implícito
- **WHEN** Conduit delega una tarea
- **THEN** no adjunta automáticamente archivos, turnos previos, variables de entorno, credenciales u otro contexto local

#### Scenario: Prompt sin modificaciones
- **WHEN** Conduit envía una delegación confirmada
- **THEN** la solicitud al proveedor contiene exactamente el prompt recibido, sin plantillas de modo, instrucciones generadas por Conduit ni contexto local añadido

#### Scenario: Prompt no se registra
- **WHEN** `delegate_task` termina correctamente o devuelve un error
- **THEN** el prompt no se escribe en logs ni aparece en mensajes de error; una respuesta exitosa solo contiene la respuesta del proveedor y metadata

#### Scenario: Prompt vacío o excesivo
- **WHEN** el prompt está vacío, contiene solo espacios o supera 100.000 caracteres
- **THEN** Conduit lo rechaza antes de contactar al proveedor

#### Scenario: API key ausente
- **WHEN** `delegate_task` apunta a un proveedor sin API key configurada
- **THEN** Conduit devuelve `missing_credentials` y no realiza una solicitud al proveedor

#### Scenario: Modelo no descubierto
- **WHEN** `model` no aparece en el catálogo reciente de ese proveedor
- **THEN** Conduit devuelve `unknown_model` y no realiza una solicitud de generación

#### Scenario: Capacidad de generación desconocida
- **WHEN** `model` aparece en el catálogo pero `generationSupport` es `unknown`
- **THEN** Conduit permite el intento explícito sin cambiar el modelo y devuelve un error sanitizado si el proveedor no admite generación

### Requirement: Endpoints oficiales fijos y errores seguros

The system SHALL usar únicamente orígenes HTTPS y endpoints documentados de los proveedores soportados y SHALL sanitizar los errores devueltos a clientes MCP.

#### Scenario: Destinos de proveedor
- **WHEN** Conduit solicita un catálogo o una respuesta de OpenAI o Google
- **THEN** usa únicamente `https://api.openai.com/v1/models`, `https://api.openai.com/v1/responses` o endpoints documentados bajo `https://generativelanguage.googleapis.com/v1beta/models`, envía la API key en un header y rechaza redirects

#### Scenario: API key solo en headers
- **WHEN** Conduit realiza una solicitud a un proveedor
- **THEN** la API key aparece solo en el header de autenticación y nunca en URL, query string o body

#### Scenario: ID Gemini en la ruta
- **WHEN** Conduit construye la ruta `generateContent` con un modelo Gemini del catálogo
- **THEN** codifica el ID como un solo segmento después de `models/` y no permite alterar origen ni ruta

#### Scenario: Timeout de proveedor
- **WHEN** una solicitud de proveedor supera 60 segundos
- **THEN** Conduit la aborta y devuelve `provider_unavailable`

#### Scenario: Límite de proveedor
- **WHEN** un proveedor devuelve HTTP 429
- **THEN** Conduit devuelve `rate_limited` y no reintenta con otra cuenta ni afirma haber evadido el límite

#### Scenario: Redirect del proveedor
- **WHEN** el endpoint oficial devuelve un redirect HTTP
- **THEN** Conduit lo rechaza y devuelve `redirect_blocked` sin reenviar la API key al nuevo destino

#### Scenario: Rechazo de autenticación o modelo
- **WHEN** un proveedor rechaza autenticación, autorización o el modelo
- **THEN** Conduit devuelve `provider_rejected` con un código de estado seguro

#### Scenario: Error de red o respuesta inválida
- **WHEN** una solicitud expira, falla en la red o devuelve datos malformados
- **THEN** Conduit devuelve `provider_unavailable` o `invalid_response` sin cuerpos, URLs, headers, textos de excepción ni stack traces sin sanitizar

### Requirement: Credenciales fuera de los datos MCP

The system SHALL leer las API keys desde el entorno del proceso y SHALL NOT aceptar ni devolver sus valores en argumentos MCP, resultados o logs.

#### Scenario: Error por credencial ausente
- **WHEN** falta una API key
- **THEN** el error puede nombrar la variable esperada (`OPENAI_API_KEY`, `GOOGLE_API_KEY` o `GEMINI_API_KEY`) pero no mostrar su valor

#### Scenario: Secreto centinela en un error del proveedor
- **WHEN** un error simulado del proveedor incluye un centinela de credencial en cuerpo, URL o headers
- **THEN** el centinela no aparece en stderr ni en resultados MCP

#### Scenario: La API key nunca aparece en una respuesta normal
- **WHEN** una llamada MCP usa una API key configurada
- **THEN** el valor de la clave no aparece en stdout, stderr, metadata ni resultado de herramienta

## Notes

Este cambio implementa delegación mediante APIs oficiales de pago por uso para OpenAI y Gemini. No implementa OAuth de suscripciones, pools multi-cuenta, cuotas, rotación, failover automático, delegación a Anthropic API ni alias `latest`; esas capacidades requieren cambios OpenSpec separados. Los modos `ask`/`plan`/`code`/`debug` pertenecen al agente anfitrión y no se transmiten al proveedor en esta versión.
