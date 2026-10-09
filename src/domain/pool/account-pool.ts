import type { ProviderId } from "../../application/ports/model-provider.js"
import { providerIds } from "../../application/ports/model-provider.js"
import type { Account } from "./account.js"

export interface AccountPool {
  provider: ProviderId
  activeIndex: number
  accounts: Account[]
}

export type PoolsMap = Record<ProviderId, AccountPool>

export interface PoolsState {
  version: 1
  updatedAt: string
  pools: PoolsMap
}

export const createEmptyPool = (provider: ProviderId): AccountPool => ({
  provider,
  activeIndex: 0,
  accounts: [],
})

export const createInitialPoolsState = (): PoolsState => {
  const pools = {} as PoolsMap
  for (const id of providerIds) {
    pools[id] = createEmptyPool(id)
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    pools,
  }
}
