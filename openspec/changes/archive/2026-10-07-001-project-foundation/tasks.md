# Tasks

## 1. Toolchain

- [x] 1.1 Define the private Node ESM package, CLI bin mapping, portable scripts, and initial dependency versions; document pnpm as recommended without pinning `packageManager`; verify `pnpm install` completes and creates `pnpm-lock.yaml`.
- [x] 1.2 Configure strict NodeNext TypeScript compilation and Vitest; verify the typecheck and test scripts resolve their executables through pnpm, npm, and Yarn script PATHs.
- [x] 1.3 Verify alternative install compatibility with npm and Yarn using isolated clean installs; confirm Corepack can invoke Yarn and scripts do not hard-code pnpm. Bun is not installed locally; retain a Bun install/run check for CI follow-up.

## 2. CLI behavior

- [x] 2.1 Add tests for `--version`, `-v`, `--help`, `-h`, no-argument help, and unknown command/option output; verify the tests exercise stdout, stderr, and exit codes.
- [x] 2.2 Implement the Commander program and injectable output streams to satisfy the CLI tests; verify all seven tests pass with pnpm, npm, and Yarn.

## 3. Executable integration

- [x] 3.1 Add the Node shebang launcher and package executable mapping; verify `pnpm run build` succeeds and the launcher prints the correct version/help from compiled output.
- [x] 3.2 Run the full foundation checks (`pnpm run typecheck`, `pnpm test`, `pnpm run build`, and `node bin/conduit.js --version`); verify all pass without provider credentials or network access.
