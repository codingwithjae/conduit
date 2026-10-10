# Tasks

## 1. Google Session Driver

- [x] 1.1 Implement `GoogleSessionDriver` in `src/adapters/outbound/providers/google-session.ts` with OAuth token exchange (`oauth2.googleapis.com`) and Gemini generation (`generativelanguage.googleapis.com`) via injected `fetch`; done when unit tests in `tests/providers/google-session.test.ts` verify token exchange, generation, and error mapping without live network.

## 2. OpenAI Session Driver

- [x] 2.1 Implement `OpenAiSessionDriver` in `src/adapters/outbound/providers/openai-session.ts` with token refresh (`auth.openai.com`) and session invocation via injected `fetch`; done when unit tests in `tests/providers/openai-session.test.ts` verify refresh, session headers, and 429 rate limit mapping without live network.

## 3. Integration into PoolInferenceUseCase

- [x] 3.1 Integrate `GoogleSessionDriver` and `OpenAiSessionDriver` into `PoolInferenceUseCase`, completely free of external runner or CLI hooks; done when unit tests in `tests/application/pool-inference.test.ts` pass 100%.

## 4. Final validation and OpenSpec verification

- [x] 4.1 Run `openspec validate --strict`, typecheck, full test suite, and build; done when all suites pass 100%.
