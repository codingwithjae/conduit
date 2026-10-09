import { readFileSync } from "node:fs"

interface PackageMetadata {
  version: string
}

const metadata = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageMetadata

export const version = metadata.version
