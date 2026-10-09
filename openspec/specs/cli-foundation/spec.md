# cli-foundation Specification

## Purpose
Define the stable, scriptable entry-point behavior for the first Conduit CLI release before provider, account, and MCP capabilities are introduced.

## Requirements

### Requirement: Display the package version

The CLI SHALL display the version declared by the installed Conduit package and exit successfully when asked for version information.

#### Scenario: Long version flag
- **WHEN** the user runs `conduit --version`
- **THEN** the CLI prints the package version to standard output and exits with code `0`

#### Scenario: Short version flag
- **WHEN** the user runs `conduit -v`
- **THEN** the CLI prints the same package version to standard output and exits with code `0`

### Requirement: Display command help

The CLI SHALL provide concise usage information that describes the executable and the commands and options currently available.

#### Scenario: Explicit help flag
- **WHEN** the user runs `conduit --help` or `conduit -h`
- **THEN** the CLI prints usage information to standard output and exits with code `0`

#### Scenario: No arguments
- **WHEN** the user runs `conduit` without arguments
- **THEN** the CLI prints the same usage information and exits with code `0`

### Requirement: Reject unknown input clearly

The CLI SHALL reject unknown commands and options without silently ignoring them.

#### Scenario: Unknown command
- **WHEN** the user runs a command that is not registered
- **THEN** the CLI prints a concise error to standard error, suggests `conduit --help`, and exits with code `1`

#### Scenario: Unknown option
- **WHEN** the user supplies an option that is not registered for the selected command
- **THEN** the CLI prints a concise error to standard error, suggests `conduit --help`, and exits with code `1`

### Requirement: Package-manager interoperability

The project SHALL document pnpm as its recommended package manager while keeping its dependency manifest and scripts usable with npm, Yarn, and Bun.

#### Scenario: Canonical pnpm install
- **WHEN** a contributor installs the project with pnpm
- **THEN** the committed pnpm lockfile provides a reproducible install and the standard build, typecheck, and test scripts are available

#### Scenario: Alternative package-manager install
- **WHEN** a user installs the project with npm, Yarn, or Bun
- **THEN** the standard package scripts run without requiring a pnpm-specific command inside their definitions or a `packageManager` field that makes Corepack reject another manager
