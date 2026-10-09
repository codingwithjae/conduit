import { runCli } from "./program.js"

void runCli()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Conduit: ${message}\n`)
    process.exitCode = 1
  })
