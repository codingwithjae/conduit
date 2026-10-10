# Proposal

## Why

Conduit's subscription pool accounts for Google (Antigravity) and OpenAI (ChatGPT Plus) need to execute inference directly using autonomous, native HTTP drivers without relying on external agent binaries (such as Kilo, OpenCode, or Codex). Hardcoding local filesystem paths to third-party CLIs violates Conduit's core constitutional principle P3 (Strict Agnosticism) and causes runtime failures on machines where those tools are not installed.

## What Changes

- Implement native, autonomous session execution drivers using standard Node.js `fetch` for pool accounts:
  - `GoogleSessionDriver`: Exchanges imported OAuth refresh tokens with `https://oauth2.googleapis.com/token` to obtain ephemeral Google Cloud Bearer tokens (`ya29...`) and directly invokes `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `Authorization: Bearer <token>`.
  - `OpenAiSessionDriver`: Automatically refreshes session tokens via `https://auth.openai.com/oauth/token` and invokes chat completions using session headers.
- Eliminate all external runner lookup functions, filesystem binary paths, and third-party agent hooks from `PoolInferenceUseCase`.
- Provide automated unit and integration tests with mocked HTTP responses ensuring complete test coverage without live network or external tools.

## Goals and Non-Goals

### Goals
- 100% native, standalone HTTP inference execution for pool accounts using standard `fetch`.
- Zero external CLI or runtime dependencies: Conduit runs identically on any system with Node.js.
- Strict adherence to Constitution Principles P0 (Spec-Driven Development) and P3 (Strict Agnosticism).

### Non-Goals
- No binary wrapping or subprocess delegation to third-party tools (Kilo, Codex, OpenCode).
- No web scraping or unofficial reverse-engineered browser automation.

## Policy and Security Risks
- Token exchange: OAuth refresh tokens are sent exclusively to official provider token endpoints (`oauth2.googleapis.com` and `auth.openai.com`) over HTTPS with redirects rejected.
- Credential safety: Ephemeral access tokens are kept in memory and persisted to `~/.conduit/pools.json` strictly under existing `0600` permissions.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `pool-inference`: Specifies autonomous HTTP session drivers for Google and OpenAI pool accounts with OAuth token exchange and direct generation endpoints.

## Impact

- `src/adapters/outbound/providers/`: New native drivers `google-session.ts` and `openai-session.ts`.
- `src/application/use-cases/pool-inference.ts`: Integrated with native session drivers, completely free of external runner references.
- `tests/providers/`: New unit tests for native Google and OpenAI session drivers using mocked fetchers.
