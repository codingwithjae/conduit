import type { Account } from "../../domain/pool/account.js"

export interface DiscoveredAccount extends Omit<Account, "addedAt"> {
  sourceName: string
}

export interface AccountImporterPort {
  readonly id: string
  readonly displayName: string
  isAvailable(): Promise<boolean>
  discover(): Promise<DiscoveredAccount[]>
}
