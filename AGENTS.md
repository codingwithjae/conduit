# Agent Instructions for Conduit

Read and adhere strictly to `docs/constitution.md` before planning or implementing changes in this repository. OpenSpec is the authoritative source of truth for all product specifications and behavioral changes.

## SDD Workflow

- **P0 Rule (Inviolable):** NO SE TOCA EL CÓDIGO HASTA QUE SE DEFINA UNA SPEC. Never write or edit production code, create execution shims, or take implementation shortcuts before a change is formally proposed, designed, and strictly validated in OpenSpec.
- **P3 Rule (Strict Agnosticism):** Never embed paths, binary lookups, or runtime dependencies to external agent tools (e.g. Kilo, OpenCode, Codex) in Conduit code. All drivers must be autonomous, native, and portable.
- When requirements or architectural details are unclear, explore the repository and run `/opsx:explore`.
- For any new feature or behavior change, draft a formal OpenSpec proposal using `/opsx:propose`. Review the `proposal.md`, `specs/`, `design.md`, and `tasks.md` before writing code.
- Implement only approved tasks from `tasks.md` using `/opsx:apply`, completing one atomic task at a time following TDD.
- Write or update unit and integration tests alongside each task. Verify all requirements before running `/opsx:archive`.

## Agent Modes

- `ask`: Read-only inquiry, exploration, and explanation. Never modifies files or runs mutating commands.
- `plan`: Architecture, EARS specification drafting, and task breakdown. Does not write production code.
- `code`: Implementation of approved tasks with test-driven development (TDD) and verification.
- `debug`: Systematic hypothesis-driven diagnosis, reproduction, and minimal targeted fixes.

## Engineering Standards

- **Terminal-First:** Phase one is strictly CLI/TUI and local MCP; no web dashboards or Electron apps.
- **Package Management:** `pnpm` is the canonical package manager with `pnpm-lock.yaml`. Standard scripts must remain usable via `npm`, `Yarn`, and `Bun`. Do not commit a `packageManager` field in `package.json` that triggers Corepack rejections.
- **Clean Architecture:** Keep core domain entities, provider adapters, account storage, Git operations, and MCP transports strictly decoupled.
- **Security & Privacy:** Never store or commit credentials in version control, logs, or MCP tool responses. File stores must enforce `0600` permissions. Subagents in Git Worktrees must have path confinement strictly enforced.
- **Clean Code & Readability:** Code must be expressive, simple, and self-documenting. Avoid cryptic abbreviations and nested loops; prefer small, single-responsibility functions and descriptive variable names.
