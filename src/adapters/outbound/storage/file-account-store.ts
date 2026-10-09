import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { homedir } from "node:os"
import type { AccountStorePort } from "../../../application/ports/account-store.js"
import type { ProviderId } from "../../../application/ports/model-provider.js"
import type { Account } from "../../../domain/pool/account.js"
import {
  createInitialPoolsState,
  type AccountPool,
  type PoolsState,
} from "../../../domain/pool/account-pool.js"
import { ConduitError } from "../../../application/ports/conduit-error.js"

export const DEFAULT_POOLS_PATH = `${homedir()}/.conduit/pools.json`

export class FileAccountStore implements AccountStorePort {
  constructor(readonly filePath: string = DEFAULT_POOLS_PATH) {}

  async load(): Promise<PoolsState> {
    try {
      const content = await readFile(this.filePath, "utf8")
      const parsed = JSON.parse(content) as PoolsState
      if (parsed.version === 1 && typeof parsed.pools === "object") {
        return parsed
      }
    } catch {
      // Return fresh initial state if file does not exist or is invalid
    }
    const freshState = createInitialPoolsState()
    await this.save(freshState)
    return freshState
  }

  async save(state: PoolsState): Promise<void> {
    const parentDirectory = dirname(this.filePath)
    await mkdir(parentDirectory, { recursive: true, mode: 0o700 })

    state.updatedAt = new Date().toISOString()
    const serialized = `${JSON.stringify(state, null, 2)}\n`
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`

    await writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 })
    await chmod(temporaryPath, 0o600).catch(() => {})
    await rename(temporaryPath, this.filePath)
    await chmod(this.filePath, 0o600).catch(() => {})
  }

  async getPool(provider: ProviderId): Promise<AccountPool> {
    const state = await this.load()
    return state.pools[provider] || { provider, activeIndex: 0, accounts: [] }
  }

  async getActiveAccount(provider: ProviderId): Promise<Account | null> {
    const pool = await this.getPool(provider)
    if (!pool.accounts.length) return null
    return pool.accounts[pool.activeIndex] || pool.accounts[0] || null
  }

  async switchActive(provider: ProviderId, target: number | string): Promise<Account> {
    const state = await this.load()
    const pool = state.pools[provider]
    if (!pool || !pool.accounts.length) {
      throw new ConduitError("unknown_provider", `No accounts available in ${provider} pool.`)
    }

    const index = this.resolveAccountIndex(pool, target)
    if (index === -1) {
      throw new ConduitError("invalid_input", `Account '${target}' not found in ${provider} pool.`)
    }

    pool.activeIndex = index
    const account = pool.accounts[index]!
    account.lastUsedAt = Date.now()
    await this.save(state)
    return account
  }

  async setAlias(provider: ProviderId, target: number | string, alias: string): Promise<Account> {
    const state = await this.load()
    const pool = state.pools[provider]
    if (!pool || !pool.accounts.length) {
      throw new ConduitError("unknown_provider", `No accounts available in ${provider} pool.`)
    }

    const index = this.resolveAccountIndex(pool, target)
    if (index === -1) {
      throw new ConduitError("invalid_input", `Account '${target}' not found in ${provider} pool.`)
    }

    const account = pool.accounts[index]!
    const cleanAlias = alias.trim()
    if (cleanAlias.toLowerCase() === "clear" || cleanAlias.toLowerCase() === "none" || !cleanAlias) {
      delete account.alias
    } else {
      account.alias = cleanAlias
    }

    await this.save(state)
    return account
  }

  async removeAccount(provider: ProviderId, target: number | string): Promise<boolean> {
    const state = await this.load()
    const pool = state.pools[provider]
    if (!pool || !pool.accounts.length) return false

    const index = this.resolveAccountIndex(pool, target)
    if (index === -1) return false

    pool.accounts.splice(index, 1)
    if (index < pool.activeIndex) {
      pool.activeIndex = Math.max(0, pool.activeIndex - 1)
    } else if (pool.activeIndex >= pool.accounts.length) {
      pool.activeIndex = Math.max(0, pool.accounts.length - 1)
    }
    await this.save(state)
    return true
  }

  async upsertAccount(
    provider: ProviderId,
    accountData: Omit<Account, "addedAt"> & { addedAt?: number },
  ): Promise<Account> {
    const state = await this.load()
    let pool = state.pools[provider]
    if (!pool) {
      pool = { provider, activeIndex: 0, accounts: [] }
      state.pools[provider] = pool
    }

    const existingIndex = pool.accounts.findIndex(
      (existingAccount) =>
        (accountData.id && existingAccount.id === accountData.id) ||
        (accountData.email && existingAccount.email.toLowerCase() === accountData.email.toLowerCase()) ||
        (accountData.tokens.refresh && existingAccount.tokens.refresh === accountData.tokens.refresh),
    )

    const now = Date.now()
    let finalAccount: Account

    if (existingIndex !== -1) {
      const existing = pool.accounts[existingIndex]!
      finalAccount = {
        ...existing,
        ...accountData,
        alias: accountData.alias ?? existing.alias,
        quotaSnapshot: accountData.quotaSnapshot ?? existing.quotaSnapshot,
        addedAt: existing.addedAt,
      }
      pool.accounts[existingIndex] = finalAccount
    } else {
      finalAccount = {
        ...accountData,
        addedAt: accountData.addedAt || now,
      }
      pool.accounts.push(finalAccount)
      if (pool.accounts.length === 1) {
        pool.activeIndex = 0
      }
    }

    await this.save(state)
    return finalAccount
  }

  private resolveAccountIndex(pool: AccountPool, target: number | string): number {
    if (typeof target === "number") {
      // 1-based index support
      if (target >= 1 && target <= pool.accounts.length) return target - 1
      // 0-based index support
      if (target === 0 && pool.accounts.length > 0) return 0
      return -1
    }

    const targetQuery = target.trim()
    const numericIndex = parseInt(targetQuery, 10)
    if (!isNaN(numericIndex) && String(numericIndex) === targetQuery) {
      if (numericIndex >= 1 && numericIndex <= pool.accounts.length) return numericIndex - 1
    }

    return pool.accounts.findIndex(
      (account) =>
        account.id === targetQuery ||
        (account.alias && account.alias.toLowerCase() === targetQuery.toLowerCase()) ||
        account.email.toLowerCase() === targetQuery.toLowerCase() ||
        account.email.toLowerCase().startsWith(targetQuery.toLowerCase()),
    )
  }
}
