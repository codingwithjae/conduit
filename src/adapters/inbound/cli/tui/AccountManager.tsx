import React, { useState } from "react"
import { Box, Text, useInput, useApp } from "ink"
import type { PoolsState } from "../../../../domain/pool/account-pool.js"
import type { Account } from "../../../../domain/pool/account.js"
import type { AccountStorePort } from "../../../../application/ports/account-store.js"
import type { ProviderId } from "../../../../application/ports/model-provider.js"
import { ConduitError } from "../../../../application/ports/conduit-error.js"

export interface AccountManagerProps {
  initialState: PoolsState
  store: AccountStorePort
  onExit?: () => void
}

interface FlattenedAccountRow {
  provider: ProviderId
  accountIndexInPool: number
  isActive: boolean
  account: Account
}

export const AccountManager: React.FC<AccountManagerProps> = ({
  initialState,
  store,
  onExit,
}) => {
  const { exit } = useApp()
  const [poolsState, setPoolsState] = useState(initialState)
  const [selectedGlobalIndex, setSelectedGlobalIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasInputValue, setAliasInputValue] = useState("")
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const flattenedAccounts: FlattenedAccountRow[] = Object.entries(poolsState.pools).flatMap(
    ([rawProviderId, pool]) =>
      pool.accounts.map((account, accountIndex) => ({
        provider: rawProviderId as ProviderId,
        accountIndexInPool: accountIndex,
        isActive: accountIndex === pool.activeIndex,
        account,
      })),
  )

  useInput((inputCharacter, key) => {
    // Mode 1: Editing alias
    if (editingAlias) {
      if (key.escape) {
        setEditingAlias(false)
        setStatusMessage("Alias edit cancelled.")
        return
      }

      if (key.return) {
        const currentTarget = flattenedAccounts[selectedGlobalIndex]
        if (!currentTarget) return

        void store
          .setAlias(currentTarget.provider, currentTarget.accountIndexInPool + 1, aliasInputValue)
          .then((updatedAccount) => {
            setEditingAlias(false)
            setStatusMessage(`Alias updated: ${updatedAccount.alias || "(none)"}`)
            void store.load().then(setPoolsState)
          })
          .catch((error: unknown) => {
            const conduitError = ConduitError.from(error)
            setStatusMessage(`Error: ${conduitError.message}`)
            setEditingAlias(false)
          })
        return
      }

      if (key.backspace || key.delete) {
        setAliasInputValue((previous) => previous.slice(0, -1))
        return
      }

      if (inputCharacter && !key.ctrl && !key.meta) {
        setAliasInputValue((previous) => previous + inputCharacter)
      }
      return
    }

    // Mode 2: Confirming deletion
    if (confirmingDelete) {
      if (inputCharacter.toLowerCase() === "y") {
        const currentTarget = flattenedAccounts[selectedGlobalIndex]
        if (!currentTarget) return

        void store
          .removeAccount(currentTarget.provider, currentTarget.accountIndexInPool + 1)
          .then(() => {
            setConfirmingDelete(false)
            setStatusMessage(`Account removed from ${currentTarget.provider} pool.`)
            setSelectedGlobalIndex((prev) => Math.max(0, prev - 1))
            void store.load().then(setPoolsState)
          })
          .catch((error: unknown) => {
            const conduitError = ConduitError.from(error)
            setStatusMessage(`Error: ${conduitError.message}`)
            setConfirmingDelete(false)
          })
        return
      }

      if (inputCharacter.toLowerCase() === "n" || key.escape) {
        setConfirmingDelete(false)
        setStatusMessage("Deletion cancelled.")
        return
      }
      return
    }

    // Mode 3: Navigation & actions
    if (inputCharacter === "q" || key.escape) {
      onExit?.()
      exit()
      return
    }

    if (key.upArrow) {
      setSelectedGlobalIndex((previous) => Math.max(0, previous - 1))
      return
    }

    if (key.downArrow) {
      setSelectedGlobalIndex((previous) => Math.min(flattenedAccounts.length - 1, previous + 1))
      return
    }

    const currentEntry = flattenedAccounts[selectedGlobalIndex]
    if (!currentEntry) return

    // 's' = Switch active
    if (inputCharacter.toLowerCase() === "s" || key.return) {
      void store
        .switchActive(currentEntry.provider, currentEntry.accountIndexInPool + 1)
        .then((switched) => {
          setStatusMessage(`Active account: ${switched.alias || switched.email}`)
          void store.load().then(setPoolsState)
        })
        .catch((error: unknown) => {
          const conduitError = ConduitError.from(error)
          setStatusMessage(`Error: ${conduitError.message}`)
        })
      return
    }

    // 'e' = Edit alias
    if (inputCharacter.toLowerCase() === "e") {
      setEditingAlias(true)
      setAliasInputValue(currentEntry.account.alias || "")
      setStatusMessage("Type new alias (or 'clear' to remove) and press Enter:")
      return
    }

    // 'd' = Delete account
    if (inputCharacter.toLowerCase() === "d") {
      setConfirmingDelete(true)
      setStatusMessage(`Are you sure you want to remove ${currentEntry.account.email}? [y/n]:`)
      return
    }
  })

  if (flattenedAccounts.length === 0) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
        <Text bold color="yellow">CONDUIT ACCOUNT MANAGER</Text>
        <Text>No accounts configured. Run 'conduit account import'.</Text>
        <Text dimColor>[q] Quit</Text>
      </Box>
    )
  }

  let runningAccountIndex = 0

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="green">
      <Text bold color="green">CONDUIT ACCOUNT MANAGER</Text>
      <Text dimColor>Interactive subscription account and pool manager</Text>
      <Text> </Text>

      {Object.entries(poolsState.pools).map(([rawProviderId, pool]) => {
        if (pool.accounts.length === 0) return null
        const poolStartIndex = runningAccountIndex
        runningAccountIndex += pool.accounts.length

        return (
          <Box key={rawProviderId} flexDirection="column" marginBottom={1}>
            <Text bold color="white">{rawProviderId.toUpperCase()}</Text>
            {pool.accounts.map((account, accountIndexInPool) => {
              const globalIndex = poolStartIndex + accountIndexInPool
              const isSelected = globalIndex === selectedGlobalIndex
              const isCurrentActive = accountIndexInPool === pool.activeIndex

              return (
                <Box key={account.id} paddingLeft={1}>
                  <Text color={isSelected ? "yellow" : isCurrentActive ? "green" : "white"}>
                    {isCurrentActive ? "● " : "○ "}
                    {isSelected ? "> " : "  "}
                    {account.alias ? `${account.alias} (${account.email})` : account.email}
                    {account.tier ? ` · ${account.tier}` : ""}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )
      })}

      {editingAlias && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
          <Text bold color="yellow">New alias: </Text>
          <Text color="white">{aliasInputValue}</Text>
          <Text color="gray">_</Text>
        </Box>
      )}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color={confirmingDelete ? "red" : "cyan"}>{statusMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          [↑/↓] Navigate · [s/Enter] Activate · [e] Edit alias · [d] Delete · [q] Quit
        </Text>
      </Box>
    </Box>
  )
}
