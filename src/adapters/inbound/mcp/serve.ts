import { serveStdio } from "@modelcontextprotocol/server/stdio"
import { ModelService } from "../../../application/use-cases/model-service.js"
import { createProviderRegistry } from "../../outbound/providers/registry.js"
import { createMcpServer } from "./server.js"

export const serveMcp = async (): Promise<number> => {
  const service = new ModelService(createProviderRegistry())
  const handle = serveStdio(() => createMcpServer(service), {
    legacy: "serve",
    onerror: () => process.stderr.write("Conduit MCP transport error.\n"),
  })

  return await new Promise<number>((resolve) => {
    let finished = false
    const finish = (exitCode = 0) => {
      if (finished) return
      finished = true
      process.off("SIGINT", onInterrupt)
      process.off("SIGTERM", onTerminate)
      process.stdin.pause()
      resolve(exitCode)
    }
    const onInterrupt = () => { void handle.close().finally(() => finish(130)) }
    const onTerminate = () => { void handle.close().finally(() => finish(143)) }
    process.once("SIGINT", onInterrupt)
    process.once("SIGTERM", onTerminate)
    process.stdin.once("end", () => finish())
  })
}
