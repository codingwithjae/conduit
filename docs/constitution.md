# Conduit Constitution

Version: 1.2  
Status: Active

This constitution governs all product, architecture, security, and contribution decisions for Conduit. If any proposal or implementation conflicts with this document, the proposal must be amended or the constitution explicitly revised through a formal, documented decision.

## 1. Purpose and Scope

Conduit is a terminal-first, provider-agnostic CLI and Model Context Protocol (MCP) server designed to discover available models, manage authorized subscription pools and API credentials, and provide resilient task delegation through standard interfaces. The initial phase is strictly limited to CLI/TUI and local MCP servers; it explicitly excludes web dashboards, Electron/desktop applications, and IDE-specific extensions.

Conduit does not replace the host agent (Claude Code, Codex CLI, Antigravity CLI, OpenCode, Kilo, etc.). Instead, it exposes interoperable capabilities so that any host can discover models, query quotas, manage account failover, and dispatch autonomous subagents into isolated Git Worktrees.

## 2. Core Principles

### P0. The SDD Golden Rule: NO SE TOCA EL CÓDIGO HASTA QUE SE DEFINA UNA SPEC
Code is strictly an artifact of the specification. It is absolutely forbidden to modify production code, introduce temporary execution shims, or take shortcuts before a change has a validated OpenSpec proposal (`proposal.md`), functional requirements in EARS notation (`spec.md`), architectural design (`design.md`), and atomic tasks (`tasks.md`). Unexpected runtime issues or bugs must immediately halt execution, trigger conceptual exploration, and be formally specified before altering any codebase file.

### P1. Spec-Driven Development (SDD)
All functional and product changes follow the OpenSpec specification-driven methodology. Unclear requirements must be explored before drafting proposals. Every change must establish observable functional requirements (in EARS notation), concrete scenarios, architectural design, and atomic tasks before implementation starts.

### P2. Terminal-First
Core capabilities must remain accessible and ergonomic within standard terminal environments. Phase one avoids heavy graphical dependencies and background web servers. Standard input/output (`stdio`) is the primary local transport for MCP clients.

### P3. Strict Client and Provider Agnosticism
Conduit's core domain and runtime must remain completely autonomous and agnostic. It is strictly forbidden to embed hardcoded paths, environment variables (`KILO_BIN`), or runtime execution hooks to Kilo, OpenCode, Claude Code, Codex, Antigravity, or any external agent tool in Conduit source code. All inference drivers must operate via standard HTTP protocols and native Node.js APIs.

### P4. Policy Compliance and Safe Boundaries
Conduit prioritizes official, documented APIs and authentication methods. It must never spoof third-party client identifiers, exploit undocumented internal web endpoints, or perform automated account rotation intended to bypass subscription terms of service. Experimental adapters require explicit user opt-in and clear risk documentation.

### P5. Local Security and Least Privilege
Credentials must be stored locally with strict operating system file permissions (`0600`, owner read/write only). Stored secrets, OAuth tokens, and API keys must never appear in logs, CLI terminal output, MCP tool results, specifications, or model context.

**Explicit Delegation Exception (Amendment 1.1):** As an approved policy exception for model delegation, Conduit transmits to the selected provider *only the exact prompt text explicitly supplied and authorized by the user*. Conduit never automatically attaches files, conversation history, environment variables, or stored credentials. Each delegation tool declares its provider, model, and potential API billing. MCP clients must seek per-call user approval and provide `confirmExternalSend: true`. If a client cannot request per-call confirmation, external delegation must remain disabled by default.

### P6. Usage Transparency and Visibility
Users must always be able to inspect which provider, model, account, and authentication mode are currently active, along with the source, age, and freshness of quota data. Conduit never silently rotates accounts without clear notification.

### P7. Dynamic Model Discovery
Where an official catalog endpoint exists, Conduit queries the provider dynamically and caches results in memory with a visible 5-minute TTL. Conduit does not maintain hardcoded static model lists as permanent truths.

### P8. Verifiable Quality (TDD)
Every functional requirement must be accompanied by automated unit/integration tests or reproducible verification scripts. Tests must use mocked network adapters and never consume real user credits or require live API keys.

### P9. Portability and Simplicity
The project avoids mandatory dependencies on external runtime agents. Node.js with TypeScript and pnpm as the canonical package manager are the baseline, while standard scripts must remain executable across npm, Yarn, and Bun.

## 3. Amendment History

- **1.0 (2026-10-07):** Initial project constitution.
- **1.1 (2026-10-07):** P5 amended to allow explicit, user-confirmed prompt transmission to designated providers for `delegate_task` and `dispatch_subagent_task`.
- **1.2 (2026-10-10):** P0 added as the SDD Golden Rule ("NO SE TOCA EL CÓDIGO HASTA QUE SE DEFINA UNA SPEC"); P3 reinforced to strictly prohibit runtime dependencies, binary lookups, or execution shims to external agents (Kilo, OpenCode, Codex).
