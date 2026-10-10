# Conduit (`agent-conduit`)

> **Terminal-first, provider-agnostic model delegation & subscription pooling runtime.**

[![npm version](https://img.shields.io/npm/v/agent-conduit.svg)](https://www.npmjs.com/package/agent-conduit)
[![npm downloads](https://img.shields.io/npm/dm/agent-conduit.svg)](https://www.npmjs.com/package/agent-conduit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/codingwithjae/conduit/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20NodeNext-blue?logo=typescript)](https://github.com/codingwithjae/conduit)
[![Vitest](https://img.shields.io/badge/Vitest-85%20passed-brightgreen?logo=vitest)](https://github.com/codingwithjae/conduit)
[![MCP](https://img.shields.io/badge/MCP-2026--07--28%20%26%20Legacy-orange)](https://github.com/codingwithjae/conduit/blob/main/docs/mcp-server.md)
[![OpenSpec](https://img.shields.io/badge/OpenSpec-Validated-success)](https://github.com/codingwithjae/conduit/tree/main/openspec)

Conduit is an agent-agnostic runtime and [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that empowers terminal agents (**Claude Code**, **Codex CLI**, **Antigravity CLI**, **OpenCode**, **Kilo Code**, **Kimi CLI**) with:

1. **Multi-Account Subscription Pooling:** Leverage flat-rate ($20/mo) consumer subscriptions (ChatGPT Plus, Google Antigravity, Claude Pro/Max) across multiple accounts without requiring expensive pay-per-token API keys.
2. **Transparent 429 Auto-Failover:** When an active account hits its rate limit (HTTP 429), Conduit seamlessly rotates to the next available account in the pool and retries without dropping conversation history or tool context.
3. **Autonomous Subagent Git Worktrees:** Dispatches secondary models (GPT-6 Luna, Claude Sonnet 5.5, Gemini Flash 3.8, DeepSeek R1) into isolated Git Worktrees (`.conduit/worktrees/<task-id>`) where subagents can read, edit, and run local test suites in a sandbox—returning a clean `git diff` for review with zero branch collisions.
4. **Universal Non-Destructive Importer:** Imports existing sessions from Antigravity, Codex, and Claude Code in seconds with read-only operations that never alter original files.
5. **Interactive Live TUI Dashboard:** A real-time terminal UI built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) featuring live second-by-second reset countdowns, visual progress bars, and keyboard navigation.

---

## Architecture Overview

<p align="center">
  <a href="https://htmlpreview.github.io/?https://github.com/codingwithjae/conduit/blob/main/docs/architecture.html">
    <img src="https://raw.githubusercontent.com/codingwithjae/conduit/main/docs/conduit-system.png" alt="Conduit System Architecture Diagram" width="100%" />
  </a>
  <br />
  <em>Interactive architecture diagram generated with <a href="https://github.com/tt-a1i/archify">Archify</a>. Open <a href="https://htmlpreview.github.io/?https://github.com/codingwithjae/conduit/blob/main/docs/architecture.html">docs/architecture.html</a> to inspect components and animate request paths.</em>
</p>

---

## Supported Providers

Conduit ships with built-in adapters for 7 leading model providers:

| Provider | Type | Protocol / Endpoint | Auth Source |
|---|---|---|---|
| **OpenAI** | Cloud | Chat Completions & Responses API | Subscription Pool or `OPENAI_API_KEY` |
| **Google Gemini** | Cloud | `v1beta/models/{id}:generateContent` | Antigravity Pool or `GOOGLE_API_KEY` / `GEMINI_API_KEY` |
| **Anthropic** | Cloud | Messages API (`/v1/messages`) | Claude Pro Pool or `ANTHROPIC_API_KEY` |
| **OpenRouter** | Aggregator | OpenAI-compatible (`openrouter.ai/api/v1`) | `OPENROUTER_API_KEY` (250+ models) |
| **DeepSeek** | Cloud | OpenAI-compatible (`api.deepseek.com/v1`) | `DEEPSEEK_API_KEY` (V3 & R1 Reasoning) |
| **Groq** | Ultra-Fast | OpenAI-compatible (`api.groq.com/openai/v1`) | `GROQ_API_KEY` (500+ tokens/sec) |
| **Ollama** | Local / Offline | OpenAI-compatible (`http://localhost:11434/v1`) | `OLLAMA_BASE_URL` ($0 cost, full privacy) |

---

## Quickstart

### 1. Installation

Install globally via npm or pnpm:

```bash
# Global install via npm
npm install -g agent-conduit

# Or via pnpm
pnpm add -g agent-conduit

# Or run instantly without global install
npx agent-conduit quota
```

Or clone and build locally:

```bash
git clone https://github.com/codingwithjae/conduit.git
cd conduit
pnpm install
pnpm run build
pnpm link --global
```

### 2. Universal Import (10 Seconds Setup)

Import accounts already configured on your machine from Antigravity, Codex, or Claude Code:

```bash
conduit account import
```

Conduit scans local directories using read-only calls and consolidates credentials in `~/.conduit/pools.json` with strict `chmod 0600` permissions.

### 3. Check Quota Dashboard

```bash
conduit quota
```

- **Live TUI Mode:** Use `↑` / `↓` to navigate accounts, press `Enter` to switch the active account, press `r` to refresh live quotas, and `q` to quit.
- **CI / Pipe Mode:** Automatically falls back to clean plain text when not in an interactive terminal (or via `conduit quota --text`).

### 4. Direct Prompt Execution

```bash
# Uses the active subscription account from the pool by default:
conduit use gpt-6-luna "Refactor this function to be thread-safe"

# Or execute with Claude Sonnet 5.5:
conduit use claude-sonnet-5.5 "Audit this authentication middleware"

# Force official API key if preferred:
conduit use gemini-3.8-flash "Analyze this data structure" --api-key
```

### 5. Autonomous Subagent Dispatch (Isolated Git Worktree)

```bash
conduit dispatch gpt-6-luna "Implement JWT middleware and add automated tests" --max-steps 15
```

Conduit provisions `.conduit/worktrees/<task-id>`, sets up a sandboxed tool loop (read, edit, test), and outputs the resulting unified `git diff` upon completion.

---

## Model Context Protocol (MCP) Integration

Run Conduit as a local stdio MCP server:

```bash
conduit mcp serve
```

### Client Configuration

#### Claude Code
```bash
claude mcp add --scope user --transport stdio conduit -- node /absolute/path/to/conduit/bin/conduit.js mcp serve
```

#### Codex CLI (`~/.codex/config.toml`)
```toml
[mcp_servers.conduit]
command = "node"
args = ["/absolute/path/to/conduit/bin/conduit.js", "mcp", "serve"]
```

#### Kilo Code / OpenCode (`opencode.json` / `kilo.json`)
```json
{
  "mcp": {
    "conduit": {
      "type": "local",
      "command": ["node", "/absolute/path/to/conduit/bin/conduit.js", "mcp", "serve"]
    }
  }
}
```

### Exposed MCP Tools

- `provider_status`: Inspect configured providers without revealing secret values.
- `list_models`: Query the dynamic catalog for any provider with a 5-minute cache TTL.
- `delegate_task`: Send an explicitly confirmed prompt to a secondary model.
- `get_quota_status`: Read real pool quota windows and reset countdowns without exposing tokens.
- `switch_account`: Switch the active account for a provider.
- `set_account_alias`: Assign or clear friendly account aliases.
- `dispatch_subagent_task`: Dispatch an autonomous subagent into an isolated Git Worktree and receive a structured `git diff` and summary.

---

## Security & Ethics Policy

Conduit follows a **Dual-Engine** design pattern:

1. **Standard Mode (Production):** 100% compliant with all provider Terms of Service using official pay-per-token API keys.
2. **Subscription Engine (Experimental):** Enables local developer pooling across personal subscriptions with strict file sandboxing (`chmod 0600`).
3. **No Credential Leaks:** Secrets are sent exclusively via HTTPS request headers, never in URLs, bodies, logs, or MCP tool results. HTTP redirects are strictly rejected.
4. **Isolated Worktrees:** Subagent tools enforce path confinement to prevent directory traversal outside the allocated worktree.

---

## Development & Verification

Conduit is governed by the [OpenSpec](https://github.com/Fission-AI/OpenSpec) specification-driven methodology.

```bash
# Run unit and integration tests (Vitest)
pnpm test

# Run strict TypeScript typecheck
pnpm run typecheck

# Validate all specifications
openspec validate --strict

# Production build
pnpm run build
```

---

## License

[MIT](LICENSE) © Conduit Contributors
