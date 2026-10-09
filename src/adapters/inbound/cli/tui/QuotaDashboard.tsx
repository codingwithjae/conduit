import React, { useState, useEffect } from "react"
import { Box, Text, useInput, useApp } from "ink"
import type { PoolQuotaView } from "../../../../application/use-cases/quota-dashboard.js"
import { QuotaDashboardUseCase } from "../../../../application/use-cases/quota-dashboard.js"
import type { AccountStorePort } from "../../../../application/ports/account-store.js"
import type { AccountWithQuota, QuotaWindow } from "../../../../domain/pool/account.js"
import { ConduitError } from "../../../../application/ports/conduit-error.js"

export interface QuotaDashboardProps {
  initialViews: PoolQuotaView[]
  store: AccountStorePort
  onExit?: () => void
}

interface FlattenedAccountEntry {
  provider: PoolQuotaView["provider"]
  indexInPool: number
  isActive: boolean
  account: AccountWithQuota
}

export const QuotaDashboard: React.FC<QuotaDashboardProps> = ({
  initialViews,
  store,
  onExit,
}) => {
  const { exit } = useApp()
  const [poolViews, setPoolViews] = useState(initialViews)
  const [selectedGlobalIndex, setSelectedGlobalIndex] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Live timer tick every 1 second
  useEffect(() => {
    const liveCountdownInterval = setInterval(() => {
      setPoolViews((currentViews) =>
        currentViews.map((poolView) => ({
          ...poolView,
          accounts: poolView.accounts.map((account) => ({
            ...account,
            windows: account.windows.map((window) => ({
              ...window,
              resetSeconds: window.resetSeconds && window.resetSeconds > 0 ? window.resetSeconds - 1 : 0,
            })),
          })),
        })),
      )
    }, 1000)

    return () => clearInterval(liveCountdownInterval)
  }, [])

  const flattenedAccountsList: FlattenedAccountEntry[] = poolViews.flatMap((poolView) =>
    poolView.accounts.map((account, accountIndex) => ({
      provider: poolView.provider,
      indexInPool: accountIndex,
      isActive: accountIndex === poolView.activeIndex,
      account,
    })),
  )

  useInput((inputCharacter, key) => {
    if (inputCharacter === "q" || key.escape) {
      onExit?.()
      exit()
      return
    }

    if (inputCharacter === "r" && !isRefreshing) {
      setIsRefreshing(true)
      setStatusMessage("Refreshing quotas live...")
      const dashboardUseCase = new QuotaDashboardUseCase(store)
      void dashboardUseCase
        .getView(true)
        .then((freshPoolViews) => {
          setPoolViews(freshPoolViews)
          setIsRefreshing(false)
          setStatusMessage("Quotas updated.")
        })
        .catch((error: unknown) => {
          setIsRefreshing(false)
          const conduitError = ConduitError.from(error)
          setStatusMessage(`Failed to refresh: ${conduitError.message}`)
        })
      return
    }

    if (key.upArrow) {
      setSelectedGlobalIndex((previousIndex) => Math.max(0, previousIndex - 1))
    }

    if (key.downArrow) {
      setSelectedGlobalIndex((previousIndex) => Math.min(flattenedAccountsList.length - 1, previousIndex + 1))
    }

    if (key.return && flattenedAccountsList[selectedGlobalIndex]) {
      const selectedEntry = flattenedAccountsList[selectedGlobalIndex]!
      void store.switchActive(selectedEntry.provider, selectedEntry.indexInPool + 1).then(() => {
        const displayName = selectedEntry.account.alias || selectedEntry.account.email
        setStatusMessage(`Active account switched to: ${displayName}`)
        setPoolViews((currentViews) =>
          currentViews.map((poolView) =>
            poolView.provider === selectedEntry.provider
              ? { ...poolView, activeIndex: selectedEntry.indexInPool }
              : poolView,
          ),
        )
      })
    }
  })

  if (flattenedAccountsList.length === 0) {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="yellow">
        <Text bold color="yellow">CONDUIT QUOTA DASHBOARD</Text>
        <Text>No accounts configured. Run 'conduit account import'.</Text>
        <Text dimColor>[q] Quit</Text>
      </Box>
    )
  }

  let cumulativeAccountIndex = 0

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">CONDUIT MULTI-ACCOUNT POOL</Text>
      <Text dimColor>Live interactive quota dashboard</Text>
      <Text> </Text>

      {poolViews.map((poolView) => {
        const poolStartIndex = cumulativeAccountIndex
        cumulativeAccountIndex += poolView.accounts.length

        return (
          <ProviderPoolSection
            key={poolView.provider}
            poolView={poolView}
            selectedGlobalIndex={selectedGlobalIndex}
            poolStartIndex={poolStartIndex}
          />
        )
      })}

      {statusMessage && (
        <Box marginTop={1}>
          <Text color="green">{statusMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>[↑/↓] Navigate · [Enter] Switch active · [r] Refresh · [q] Quit</Text>
      </Box>
    </Box>
  )
}

interface ProviderPoolSectionProps {
  poolView: PoolQuotaView
  selectedGlobalIndex: number
  poolStartIndex: number
}

const ProviderPoolSection: React.FC<ProviderPoolSectionProps> = ({
  poolView,
  selectedGlobalIndex,
  poolStartIndex,
}) => (
  <Box flexDirection="column" marginBottom={1}>
    <Text bold color="white">{poolView.provider.toUpperCase()}</Text>
    {poolView.accounts.map((account, accountIndexInPool) => {
      const globalIndex = poolStartIndex + accountIndexInPool
      const isSelected = globalIndex === selectedGlobalIndex
      const isCurrentActive = accountIndexInPool === poolView.activeIndex

      return (
        <AccountQuotaRow
          key={account.id}
          account={account}
          isSelected={isSelected}
          isActive={isCurrentActive}
        />
      )
    })}
  </Box>
)

interface AccountQuotaRowProps {
  account: AccountWithQuota
  isSelected: boolean
  isActive: boolean
}

const AccountQuotaRow: React.FC<AccountQuotaRowProps> = ({ account, isSelected, isActive }) => {
  const accountDisplayName = account.alias ? `${account.alias} (${account.email})` : account.email
  const tierDescription = account.tier ? ` · ${account.tier}` : ""

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Box>
        <Text color={isSelected ? "yellow" : isActive ? "green" : "white"}>
          {isActive ? "● " : "○ "}
          {isSelected ? "> " : "  "}
          {accountDisplayName}
          {tierDescription}
        </Text>
      </Box>
      {account.windows.map((quotaWindow) => (
        <QuotaWindowLine key={quotaWindow.window} quotaWindow={quotaWindow} />
      ))}
    </Box>
  )
}

interface QuotaWindowLineProps {
  quotaWindow: QuotaWindow
}

const QuotaWindowLine: React.FC<QuotaWindowLineProps> = ({ quotaWindow }) => {
  const formattedCountdown = formatCountdownDuration(quotaWindow.resetSeconds)
  return (
    <Box paddingLeft={4}>
      <Text dimColor>{quotaWindow.window.padEnd(8)} </Text>
      <Text color="cyan">[{renderProgressBar(quotaWindow.remainingPercent)}] </Text>
      <Text>{quotaWindow.remainingPercent}%</Text>
      {formattedCountdown ? <Text dimColor> · resets in {formattedCountdown}</Text> : null}
    </Box>
  )
}

function formatCountdownDuration(remainingSeconds?: number): string {
  if (remainingSeconds == null || remainingSeconds <= 0) return ""
  const days = Math.floor(remainingSeconds / 86400)
  const hours = Math.floor((remainingSeconds % 86400) / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function renderProgressBar(percentage: number, totalCharacterWidth = 10): string {
  const boundedPercentage = Math.max(0, Math.min(100, percentage))
  const filledCount = Math.round((boundedPercentage / 100) * totalCharacterWidth)
  const emptyCount = totalCharacterWidth - filledCount
  return "█".repeat(filledCount) + "░".repeat(emptyCount)
}
