import type { AccountStorePort } from "../ports/account-store.js"
import type { AccountImporterPort, DiscoveredAccount } from "../ports/account-importer.js"
import type { Account } from "../../domain/pool/account.js"

export interface ImportReport {
  scannedSources: string[]
  totalDiscovered: number
  importedAccounts: Account[]
}

export class ImportAccountsUseCase {
  constructor(
    private readonly store: AccountStorePort,
    private readonly importers: AccountImporterPort[],
  ) {}

  async scan(): Promise<Map<string, DiscoveredAccount[]>> {
    const results = new Map<string, DiscoveredAccount[]>()
    for (const importer of this.importers) {
      if (await importer.isAvailable()) {
        const accounts = await importer.discover()
        if (accounts.length > 0) {
          results.set(importer.displayName, accounts)
        }
      }
    }
    return results
  }

  async importAll(): Promise<ImportReport> {
    const scanResults = await this.scan()
    const importedAccounts: Account[] = []
    let totalDiscovered = 0

    for (const accounts of scanResults.values()) {
      totalDiscovered += accounts.length
      for (const account of accounts) {
        const saved = await this.store.upsertAccount(account.provider, account)
        importedAccounts.push(saved)
      }
    }

    return {
      scannedSources: Array.from(scanResults.keys()),
      totalDiscovered,
      importedAccounts,
    }
  }
}
