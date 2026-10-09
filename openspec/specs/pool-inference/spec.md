# Spec

## Purpose

Execute inference prompts directly from the CLI backed by subscription pool accounts, with configurable priority and transparent auto-failover on rate limits (429).

## Requirements

### Requirement: Inference backed by subscription pools

The system SHALL provide the `conduit use <model> <prompt>` command to execute inference prioritizing the active subscription pool account of the corresponding provider.

#### Scenario: Default inference using active pool account
- **WHEN** the user executes `conduit use <model> <prompt>` and an active pool account exists for that provider
- **THEN** Conduit executes inference using that account's session tokens and displays the response in the terminal

#### Scenario: Force official API key with flag
- **WHEN** the user executes `conduit use <model> <prompt> --api-key`
- **THEN** Conduit bypasses the pool account and delegates the request to the configured official API key in environment variables

#### Scenario: No pool accounts and no API key
- **WHEN** no pool accounts exist for that provider and no API key is configured
- **THEN** Conduit halts with an actionable error message suggesting running `conduit account import`

### Requirement: Transparent auto-failover on rate limits (429)

The system SHALL intercept HTTP 429 rate limit responses on the active pool account, rotate to the next available account in the pool, and retry the request without interrupting the operation.

#### Scenario: Automatic rotation and retry on rate limit
- **WHEN** the active account of a provider returns HTTP 429 during `conduit use` and other accounts exist in the pool
- **THEN** Conduit rotates to the next available account, successfully retries the request, and reports which account served the final response

#### Scenario: All pool accounts rate-limited
- **WHEN** all accounts in the pool for that provider return HTTP 429
- **THEN** Conduit returns a `rate_limited` error stating that all accounts in the pool have reached their rate limits

#### Scenario: Persistent update of active account
- **WHEN** auto-failover successfully rotates to a new account
- **THEN** Conduit updates the active account index in `~/.conduit/pools.json` with strict `0600` permissions
