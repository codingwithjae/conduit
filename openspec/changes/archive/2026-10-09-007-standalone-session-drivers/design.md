# Design

## Context

Consult `proposal.md` for problem context and `specs/pool-inference/spec.md` for observable behavioral requirements. Conduit's pool accounts for Google Antigravity and OpenAI ChatGPT Plus require native, autonomous HTTP drivers to execute model inference without depending on third-party CLIs, subprocess wrappers, or hardcoded paths.

## Goals / Non-Goals

**Goals:**
- Implement `GoogleSessionDriver` to perform OAuth token exchange (`https://oauth2.googleapis.com/token`) and invoke the Gemini generation endpoint via `Authorization: Bearer <token>` natively.
- Implement `OpenAiSessionDriver` to handle session token refresh (`https://auth.openai.com/oauth/token`) and generation calls with session headers.
- Eliminate all external runner lookups, filesystem binary searches (`KILO_BIN`), or third-party agent hooks from `PoolInferenceUseCase`.
- Provide 100% test coverage using injected `fetch` mocks without network calls or external tools.

**Non-Goals:**
- No subprocess wrapping of third-party CLI tools (Kilo, Codex, OpenCode).
- No unofficial web scraping or reverse-engineered browser automation.

## Decisions

### 1. Native Google Antigravity Session Driver
`GoogleSessionDriver` (`src/adapters/outbound/providers/google-session.ts`):
- Checks if `account.tokens.access` is valid. If expired or missing:
  - Calls `POST https://oauth2.googleapis.com/token` with `grant_type: "refresh_token"`, `client_id`, and `refresh_token`.
  - Caches `access` and `expiresAt` on `account.tokens` and persists to `AccountStorePort`.
- Invokes generation:
  - `POST https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent`
  - Header: `Authorization: Bearer <access_token>`
  - Body: `{ contents: [{ role: "user", parts: [{ text: prompt }] }] }`
  - Extracts text from `candidates[0].content.parts[0].text`.

### 2. Native OpenAI Session Driver
`OpenAiSessionDriver` (`src/adapters/outbound/providers/openai-session.ts`):
- Refreshes token via `POST https://auth.openai.com/oauth/token` with `client_id: "app_EMoamEEZ73f0CkXaXp7hrann"` if expired.
- Sends generation request with session headers:
  - Header: `Authorization: Bearer <access_token>`
  - Header: `ChatGPT-Account-Id: <accountId>`
- Mappable error handling for rate limits (429) to trigger auto-failover seamlessly.

### 3. Decoupled PoolInferenceUseCase
In `src/application/use-cases/pool-inference.ts`:
- Replaces any ad-hoc runner calls with calls to `GoogleSessionDriver` and `OpenAiSessionDriver`.
- Remains 100% standalone and portable: runs identically in any Node.js environment.

## Risks / Trade-offs

- **[Revoked refresh token]** → If Google or OpenAI returns a token exchange error indicating an invalid grant, Conduit catches it and throws `ConduitError("token_revoked", "Refresh token is invalid or revoked. Run 'conduit account import'.")`.
- **[Redirect protection]** → All token exchange and generation requests use `redirect: "manual"` to prevent forwarding tokens across origin redirects.

## Migration Plan

100% backward-compatible. Existing pools in `~/.conduit/pools.json` contain the exact refresh tokens needed for autonomous exchange.
