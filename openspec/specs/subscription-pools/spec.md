# Spec

## Purpose

Manage multi-account subscription pools with secure local storage in 0600 mode, non-destructive universal import, and an interactive reactive terminal dashboard.

## Requirements

### Requirement: Secure local account storage

The system SHALL store and persist account pools in `~/.conduit/pools.json`, enforcing strict `0600` file permissions atomically on every write, including quota snapshots.

#### Scenario: Atomic save with 0600 permissions
- **WHEN** Conduit creates or updates the pools file
- **THEN** it writes via a temporary file and atomic rename, ensuring permissions are strictly `0600` (`rw-------`)

#### Scenario: Reading persisted accounts
- **WHEN** Conduit initializes or loads account state
- **THEN** it parses `~/.conduit/pools.json` and validates its structure without leaking tokens or secrets to standard output

### Requirement: Universal non-destructive importer

The system SHALL provide an import engine that discovers local accounts from Antigravity, Codex, and Claude Code using strict read-only access without altering source files.

#### Scenario: Discover accounts from Antigravity
- **WHEN** the user runs import and `~/.config/opencode/antigravity-accounts.json` exists
- **THEN** Conduit detects Google Antigravity accounts and extracts emails, labels, refresh tokens, and cached quota trees

#### Scenario: Discover accounts from Codex and Kilo OpenAI
- **WHEN** OpenAI account files exist in `~/.config/kilo/openai-accounts.json` or `~/.local/share/kilo/auth.json`
- **THEN** Conduit detects OpenAI accounts and extracts emails, plans, and session tokens

#### Scenario: Discover accounts from Claude Code
- **WHEN** authentication files exist in `~/.config/opencode/anthropic-auth.json` or `auth.json`
- **THEN** Conduit detects Claude Pro/Max sessions and extracts tokens and cached quotas from `anthropic-auth-state.json`

#### Scenario: Interactive selective import
- **WHEN** the user executes `conduit account import`
- **THEN** the system scans available sources and imports discovered accounts

#### Scenario: Deduplication of existing accounts
- **WHEN** an imported account already exists in the Conduit pool
- **THEN** it updates the corresponding tokens and quota snapshot without duplicating the account entry

#### Scenario: Strict read-only source access
- **WHEN** the importer reads any external configuration file
- **THEN** it opens files in read-only mode and never modifies or deletes source files

### Requirement: Pool and active account management

The system SHALL provide terminal commands and an interactive TUI to list accounts, switch active accounts, and manage friendly aliases.

#### Scenario: List accounts without exposing tokens
- **WHEN** the user runs `conduit account list`
- **THEN** it displays provider, index, email/alias, detected plan, and active status without printing access or refresh tokens

#### Scenario: Switch active account by index or alias
- **WHEN** the user runs `conduit account switch <provider> <target>`
- **THEN** it updates the active account index for that provider and persists the change with `0600` permissions

#### Scenario: Assign and clear aliases
- **WHEN** the user runs `conduit account alias <provider> <target> <alias>`
- **THEN** it associates the alias with the account or removes it if `clear` is specified

#### Scenario: Interactive AccountManager panel with Ink
- **WHEN** the user runs `conduit account` without subcommands in an interactive terminal
- **THEN** it renders an Ink TUI supporting arrow navigation, `s` to activate, `e` to edit alias, `d` to delete, and `q` to quit

### Requirement: Interactive terminal quota dashboard

The system SHALL render a live interactive TUI dashboard using Ink / React when running `conduit quota`, supporting fast local snapshots and on-demand refresh.

#### Scenario: Reactive quota presentation with Ink
- **WHEN** the user runs `conduit quota` in an interactive terminal
- **THEN** it renders an interactive React component with visual quota bars, available percentages, and accounts from the local snapshot in under 50ms

#### Scenario: Exhaustive 4-line breakdown for Google Antigravity
- **WHEN** displaying a Google Antigravity account in the dashboard
- **THEN** it displays all 4 quota windows: Gemini/5h, Gemini/Wk, Non-Gem/5h, and Non-Gem/Wk with percentages and relative reset countdowns

#### Scenario: On-demand live quota refresh
- **WHEN** the user presses `r` in the TUI or runs `conduit quota --refresh`
- **THEN** it queries live provider sources, updates snapshots in `~/.conduit/pools.json`, and refreshes the view immediately

#### Scenario: Live countdown timer
- **WHEN** the quota dashboard is active on screen
- **THEN** it decrements remaining countdown seconds live without screen flicker

#### Scenario: Keyboard navigation and activation
- **WHEN** the user navigates with arrow keys and presses Enter on an account
- **THEN** it switches the active account in the pool immediately and updates the visual indicator in real time
