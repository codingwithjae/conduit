# Conduit MCP Server

Conduit exposes standard Model Context Protocol (MCP) tools over `stdio` to any compatible client (Claude Code, Codex CLI, Antigravity CLI, Cursor, Windsurf, OpenCode, Kilo Code, etc.). The server runs as a local child process without opening external network ports or requiring third-party agent CLIs.

## Prerequisites

- Node.js `>= 20.19.0`
- Configured provider API keys (optional, if using direct API keys) and/or imported subscription accounts (`~/.conduit/pools.json`).

## Running Locally

```bash
pnpm install
pnpm run build
node bin/conduit.js mcp serve
```

The command establishes standard JSON-RPC communication over `stdio`. Do not write log statements or arbitrary text to `stdout`, as this violates the MCP framing protocol.

## Supported Environment Variables

For official pay-per-use API keys:
- **OpenAI:** `OPENAI_API_KEY`
- **Google Gemini:** `GOOGLE_API_KEY` (fallback: `GEMINI_API_KEY`)
- **Anthropic:** `ANTHROPIC_API_KEY`
- **OpenRouter:** `OPENROUTER_API_KEY`
- **DeepSeek:** `DEEPSEEK_API_KEY`
- **Groq:** `GROQ_API_KEY`
- **Ollama (local):** `OLLAMA_BASE_URL` (e.g. `http://localhost:11434/v1`)

For subscription accounts ($20/mo flat-rate), run `conduit account import` to import sessions into `~/.conduit/pools.json` with secure `0600` permissions.

## Available MCP Tools

| Tool | Description | Input Parameters |
|---|---|---|
| `provider_status` | Reports whether each supported provider has credentials configured. Never reveals secrets. | `{}` |
| `list_models` | Queries the dynamic official model catalog for a supported provider. Cached in memory for 5 minutes. | `{ provider: "openai" \| "google" \| ... }` |
| `delegate_task` | Transmits the exact user prompt to the specified provider and model. Requires explicit confirmation. | `{ provider, model, prompt, confirmExternalSend: true }` |
| `get_quota_status` | Returns real quota window metrics (5h and 7d remaining, countdowns) across account pools without exposing tokens. | `{}` |
| `switch_account` | Switches the active account for a provider in the local pool. | `{ provider, target: "1" \| "alias" }` |
| `set_account_alias` | Assigns or removes (`clear`) a friendly alias for a pool account. | `{ provider, target, alias }` |
| `dispatch_subagent_task` | Spawns an autonomous subagent in an isolated Git Worktree (`.conduit/worktrees/`), executes an iterative tool loop (read, edit, test), and returns structured diff and summary. | `{ model, task, maxSteps?, confirmExternalSend: true }` |

## Registering in MCP Clients

### Claude Code
```bash
claude mcp add --scope user --transport stdio conduit -- node /absolute/path/to/conduit/bin/conduit.js mcp serve
```

### Codex CLI (`~/.codex/config.toml`)
```toml
[mcp_servers.conduit]
command = "node"
args = ["/absolute/path/to/conduit/bin/conduit.js", "mcp", "serve"]
```

### Cursor (`~/.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "conduit": {
      "command": "node",
      "args": ["/absolute/path/to/conduit/bin/conduit.js", "mcp", "serve"]
    }
  }
}
```

### OpenCode / Kilo Code (`opencode.json` / `kilo.json`)
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
