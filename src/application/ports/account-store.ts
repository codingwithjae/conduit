import type { AccountPool, PoolsState } from "../../domain/pool/account-pool.js"
import type { Account } from "../../domain/pool/account.js"
import type { ProviderId } from "./model-provider.js"

export interface AccountStorePort {
  load(): Promise<PoolsState>
  save(state: PoolsState): Promise<void>
  getPool(provider: ProviderId): Promise<AccountPool>
  getActiveAccount(provider: ProviderId): Promise<Account | null>
  switchActive(provider: ProviderId, target: number | string): Promise<Account>
  setAlias(provider: ProviderId, target: number | string, alias: string): Promise<Account>
  removeAccount(provider: ProviderId, target: number | string): Promise<boolean>
  upsertAccount(provider: ProviderId, account: Omit<Account, "addedAt"> & { addedAt?: number }): Promise<Account>
}
