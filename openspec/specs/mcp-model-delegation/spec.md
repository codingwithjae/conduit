# Spec

## Purpose

Expose a lightweight, agent-agnostic MCP stdio server that discovers models available through official APIs and delegates explicitly authorized text tasks.

## Requirements

### Requirement: Dual-era MCP over stdio

The system SHALL provide `conduit mcp serve` using `serveStdio` from the official MCP SDK, supporting both modern (2026-07-28) and legacy (2025-era) MCP clients.

#### Scenario: Modern discovery
- **WHEN** a modern client sends `server/discover` with valid `_meta` metadata
- **THEN** the server responds with `resultType: complete`, `supportedVersions: ["2026-07-28"]`, `tools` capability, server identity in `_meta`, and cache hints

#### Scenario: Discovery cache hints
- **WHEN** a modern client sends `server/discover`
- **THEN** the response includes `ttlMs: 300000` and `cacheScope: public`

#### Scenario: Modern request without handshake
- **WHEN** a modern client sends `tools/list` with per-request metadata without sending `initialize`
- **THEN** the server processes the request statelessly without relying on state from prior requests

#### Scenario: Legacy client compatibility
- **WHEN** a legacy client connects with `initialize` followed by `notifications/initialized`
- **THEN** `serveStdio` handles the connection using legacy semantics and serves `tools/list` and `tools/call`

#### Scenario: Modern cacheable tools list
- **WHEN** a modern client requests `tools/list`
- **THEN** the complete result includes `resultType: complete`, `ttlMs: 300000`, and `cacheScope: public`

#### Scenario: Incomplete modern metadata
- **WHEN** a modern client omits required `_meta` fields in a request
- **THEN** the SDK rejects the request with an invalid parameters error before executing any Conduit tool handler

#### Scenario: Clean protocol output
- **WHEN** the server starts or handles any request
- **THEN** stdout contains only valid MCP protocol messages and diagnostics are written strictly to stderr

#### Scenario: Clean transport shutdown
- **WHEN** the client closes stdin or the process receives SIGINT/SIGTERM
- **THEN** the server closes the MCP transport and exits cleanly without leaving child processes running

#### Scenario: Startup makes no provider calls
- **WHEN** the server starts or completes discovery/list
- **THEN** it performs zero network requests to model providers

### Requirement: Safe provider status reporting

The system SHALL report whether credentials are configured for each supported provider (`openai`, `google`, `anthropic`, `openrouter`, `deepseek`, `groq`, `ollama`) without verifying or exposing secret values.

`provider_status` SHALL accept an empty object and return structured text with `provider`, `configured`, and `credentialSource` for each supported provider. `credentialSource` may only identify the selected environment variable name, never its value.

#### Scenario: Configured API keys
- **WHEN** an MCP client calls `provider_status`
- **THEN** the response indicates for each provider whether it is configured and names the detected environment variable without verifying the key

#### Scenario: No configured keys
- **WHEN** no supported environment variable is present or non-empty
- **THEN** the server remains available and reports all providers as not configured

#### Scenario: Google key alias selection
- **WHEN** both `GOOGLE_API_KEY` and `GEMINI_API_KEY` are non-empty
- **THEN** Conduit selects `GOOGLE_API_KEY` and reports that name without revealing either secret value

#### Scenario: Ollama base URL detection
- **WHEN** `OLLAMA_BASE_URL` is defined with a non-empty URL
- **THEN** Conduit reports `ollama` as configured with `credentialSource: "OLLAMA_BASE_URL"` without requiring an API key

### Requirement: Current model discovery and capabilities

The system SHALL retrieve models from the official model catalog of the selected provider and expose capability certainty and cache freshness.

`list_models` SHALL accept `{ provider }` and return objects with `id`, `provider`, `generationSupport`, `fetchedAt`, `cacheAgeSeconds`, and `cacheTtlSeconds`.

#### Scenario: List models for configured provider
- **WHEN** an MCP client calls `list_models` for any configured supported provider
- **THEN** the response contains model objects with `id`, `provider`, `generationSupport`, `fetchedAt`, `cacheAgeSeconds`, and `cacheTtlSeconds`

#### Scenario: OpenAI generation capability unknown
- **WHEN** the OpenAI catalog does not explicitly establish text generation capability
- **THEN** Conduit reports `generationSupport: "unknown"` rather than asserting generation support

#### Scenario: Gemini generation capability confirmed
- **WHEN** Conduit inspects Google's official model catalog
- **THEN** it includes only models whose metadata lists `generateContent`, normalizes the ID without `models/`, and marks `generationSupport: "supported"`

#### Scenario: OpenAI catalog without cursors
- **WHEN** Conduit queries OpenAI's `/v1/models` endpoint
- **THEN** it processes the returned `data` array without inventing cursor-based pagination

#### Scenario: Official Anthropic catalog
- **WHEN** Conduit queries `GET https://api.anthropic.com/v1/models`
- **THEN** it returns models from Anthropic with `generationSupport: "supported"`

#### Scenario: Unfiltered OpenRouter catalog
- **WHEN** Conduit queries OpenRouter's model catalog
- **THEN** it returns all models provided by the official endpoint without applying restrictive filters

#### Scenario: Compatible provider capability unknown
- **WHEN** DeepSeek, Groq, or Ollama catalogs do not explicitly verify generation support
- **THEN** Conduit reports `generationSupport: "unknown"`

#### Scenario: Fresh catalog cache
- **WHEN** a catalog was fetched within the last 5 minutes
- **THEN** `list_models` returns the cached catalog with visible freshness metadata

#### Scenario: Expired catalog cache
- **WHEN** the cached catalog is older than 5 minutes
- **THEN** `list_models` refreshes it from the provider's official endpoint before returning

#### Scenario: Catalog refresh failure
- **WHEN** an expired catalog cannot be refreshed
- **THEN** `list_models` returns a sanitized error and does not return stale entries as current

#### Scenario: Catalog request without credentials
- **WHEN** `list_models` is invoked for an unconfigured provider
- **THEN** it returns `missing_credentials` without initiating network requests

### Requirement: Explicit prompt delegation

The system SHALL transmit to the selected provider only the exact prompt supplied to `delegate_task` when the invocation confirms external transfer.

`delegate_task` SHALL accept `provider`, `model`, `prompt` (1–100,000 characters), and optional `confirmExternalSend` (must be `true` to execute). It accepts no external URLs, credentials, or custom instructions.

#### Scenario: Confirmed prompt delegation
- **WHEN** `delegate_task` receives a supported provider, model ID, valid prompt, and `confirmExternalSend: true`
- **THEN** Conduit sends only that prompt without added instructions and returns the provider, model, and generated response text

#### Scenario: Unconfirmed prompt delegation
- **WHEN** `confirmExternalSend` is missing or false
- **THEN** Conduit returns `consent_required` and makes no provider request

#### Scenario: Anthropic Messages API delegation
- **WHEN** `delegate_task` targets `anthropic` with valid confirmation
- **THEN** Conduit sends the prompt via `POST https://api.anthropic.com/v1/messages` with `x-api-key` and `anthropic-version: 2023-06-01`

#### Scenario: OpenAI-compatible delegation
- **WHEN** `delegate_task` targets `openrouter`, `deepseek`, `groq`, or `ollama` with valid confirmation
- **THEN** Conduit sends the prompt via `POST /chat/completions` to the configured endpoint

#### Scenario: Billing and transfer disclosure
- **WHEN** an MCP client lists `delegate_task`
- **THEN** its description states that the prompt is sent to the selected provider/model and may incur API charges separate from any subscription

#### Scenario: Host per-call approval
- **WHEN** an MCP client configures Conduit for `delegate_task`
- **THEN** it must request human approval per call and show provider, model, and prompt; if unable, it must not enable the tool

#### Scenario: Confirmation flag as caller assertion
- **WHEN** `confirmExternalSend` is `true`
- **THEN** Conduit treats it as an assertion by the client and does not claim to verify human approval server-side

#### Scenario: No implicit local context
- **WHEN** Conduit delegates a task to any provider
- **THEN** it does not automatically append files, prior turns, environment variables, credentials, or local context

#### Scenario: Unmodified user prompt
- **WHEN** Conduit transmits a confirmed prompt
- **THEN** the request contains exactly the user-supplied prompt without mode templates or system instructions added by Conduit

#### Scenario: Prompt not logged
- **WHEN** `delegate_task` completes or errors
- **THEN** the prompt is not written to logs or error messages; a successful result returns provider text and metadata

#### Scenario: Empty or oversized prompt
- **WHEN** the prompt is empty, whitespace-only, or exceeds 100,000 characters
- **THEN** Conduit rejects the request before contacting any provider

#### Scenario: Missing provider credentials
- **WHEN** `delegate_task` targets a provider without configured credentials
- **THEN** Conduit returns `missing_credentials` without initiating network requests

#### Scenario: Unlisted model
- **WHEN** `model` does not appear in the recent catalog for that provider
- **THEN** Conduit returns `unknown_model` without initiating a generation request

#### Scenario: Unknown generation support attempt
- **WHEN** `model` appears in the catalog with `generationSupport: "unknown"`
- **THEN** Conduit allows the explicit call and returns a sanitized error if the provider rejects generation

### Requirement: Fixed official endpoints and sanitized errors

The system SHALL send requests only to fixed HTTPS origins and documented API endpoints (or validated `OLLAMA_BASE_URL` for local Ollama) and SHALL sanitize all errors returned to MCP clients.

#### Scenario: Official provider endpoints
- **WHEN** Conduit queries catalogs or generation for cloud providers
- **THEN** it uses only official origins (`api.openai.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`, `openrouter.ai`, `api.deepseek.com`, `api.groq.com`), sends credentials in headers, and rejects redirects

#### Scenario: Local Ollama endpoint validation
- **WHEN** Conduit sends requests to Ollama
- **THEN** it uses `OLLAMA_BASE_URL` as a fixed base without allowing endpoint overrides or following external redirects

#### Scenario: Credentials strictly in headers
- **WHEN** Conduit sends requests to any provider
- **THEN** API keys appear only in authorization headers (`Authorization: Bearer` or `x-api-key`), never in URL, query parameters, or body

#### Scenario: Gemini model path segment
- **WHEN** Conduit builds the `generateContent` URL for Gemini
- **THEN** it encodes the ID as a single segment after `models/` without allowing origin or path alteration

#### Scenario: Provider request timeout
- **WHEN** a provider request exceeds 60 seconds
- **THEN** Conduit aborts the request and returns `provider_unavailable`

#### Scenario: Provider rate limit
- **WHEN** a provider returns HTTP 429
- **THEN** Conduit returns `rate_limited` without retrying through another account

#### Scenario: Provider redirect rejection
- **WHEN** an official endpoint returns an HTTP redirect
- **THEN** Conduit rejects the redirect and returns `redirect_blocked` without forwarding credentials

#### Scenario: Authentication or model rejection
- **WHEN** a provider returns authentication, authorization, or unsupported-model errors
- **THEN** Conduit returns `provider_rejected` with a safe status code

#### Scenario: Network error or malformed response
- **WHEN** a request times out, fails at network level, or returns malformed data
- **THEN** Conduit returns `provider_unavailable` or `invalid_response` without raw bodies, URLs, headers, or stack traces

### Requirement: Managed credentials excluded from MCP data

The system SHALL read API keys and base URLs from the process environment and SHALL NOT accept or return credential values in MCP arguments, results, or logs.

#### Scenario: Missing credential error
- **WHEN** a required credential is missing
- **THEN** the error names the expected environment variable without displaying any secret value

#### Scenario: Sentinel credentials in provider errors
- **WHEN** a mocked provider error contains a credential sentinel
- **THEN** the sentinel never appears in stderr or MCP tool results

#### Scenario: Credentials absent from normal outputs
- **WHEN** an MCP tool call succeeds or fails
- **THEN** credential values never appear in stdout, stderr, metadata, or tool results
