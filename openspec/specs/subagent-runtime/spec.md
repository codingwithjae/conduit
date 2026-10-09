# Spec

## Purpose

Provide an autonomous execution runtime for subagents with strict isolation in temporary Git Worktrees, bounded tool loops, and structured diff generation returned to supervisor agents.

## Requirements

### Requirement: Physical execution isolation in Git Worktrees

The system SHALL create a temporary Git Worktree in `.conduit/worktrees/<task-id>` on a dedicated branch `conduit/task-<task-id>` for each subagent task, guaranteeing complete isolation from the supervisor's active working tree.

#### Scenario: Creation of temporary worktree on dedicated branch
- **WHEN** a subagent task begins
- **THEN** Conduit creates a temporary branch and provisions the isolated worktree in `.conduit/worktrees/<task-id>` based on the repository's base branch

#### Scenario: Git diff extraction and automatic cleanup
- **WHEN** the subagent completes the task or reaches its step limit
- **THEN** Conduit generates the unified `git diff` against the base branch and deletes the worktree directory and branch

#### Scenario: Main repository preservation without collisions
- **WHEN** a subagent modifies files or runs commands within its worktree
- **THEN** the supervisor's working directory remains intact with zero concurrent collisions

### Requirement: Bounded agentic tool loop with development sandbox

The system SHALL execute an iterative tool loop for the subagent bounded by a configurable step limit (default: 15).

#### Scenario: Local tools confined to worktree
- **WHEN** the subagent invokes read, write, edit, or shell tools
- **THEN** write operations and command executions run with the working directory (`cwd`) strictly fixed to the assigned worktree

#### Scenario: Read-only access to skills and documentation
- **WHEN** the subagent inspects repository skills or project context files
- **THEN** Conduit permits read access to instructions without granting modification permissions over those files

#### Scenario: Maximum step limit guardrail (default: 15)
- **WHEN** the subagent reaches the maximum allowed steps (15 by default or as specified by the supervisor)
- **THEN** Conduit halts the tool loop gracefully, computes the accumulated diff, and returns it to the supervisor

#### Scenario: Blocking writes outside worktree
- **WHEN** a subagent attempts to write or edit a path outside `.conduit/worktrees/<task-id>`
- **THEN** Conduit blocks the operation with a confinement violation error without touching the filesystem

### Requirement: Continuous auto-failover during tool loop

The system SHALL preserve and propagate accumulated conversation and tool history across rate-limit rotations during the subagent loop.

#### Scenario: Hot account rotation on 429 during loop
- **WHEN** a model call at step N of the loop returns HTTP 429 and alternative accounts exist in the pool
- **THEN** Conduit rotates the active account, forwards the accumulated message history up to step N, and resumes the loop

#### Scenario: Preservation of tool history across rotation
- **WHEN** account rotation occurs during the tool loop
- **THEN** the replacement account receives all prior tool outputs and turns generated in previous steps
