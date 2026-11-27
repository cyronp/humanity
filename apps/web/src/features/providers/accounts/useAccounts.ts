import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AgentProvider } from "@humanity/contracts"
import { type Exit } from "effect"
import { useCallback, useMemo, useState } from "react"
import { keys } from "@/lib/rpc"
import {
  addProviderAccountAtom,
  providerAccountsAtom,
  refreshProviderAccountsAtom,
  removeProviderAccountAtom,
  setActiveProviderAccountAtom,
} from "./atoms.ts"
import { failureMessage } from "@/lib/errors"

const failure = (exit: Exit.Exit<unknown, unknown>): string | undefined => failureMessage(exit)

export function useAccounts(provider: AgentProvider) {
  const result = useAtomValue(providerAccountsAtom(provider))
  const check = useAtomSet(refreshProviderAccountsAtom, { mode: "promiseExit" })
  const addAccount = useAtomSet(addProviderAccountAtom, { mode: "promiseExit" })
  const removeAccount = useAtomSet(removeProviderAccountAtom, { mode: "promiseExit" })
  const setActiveAccount = useAtomSet(setActiveProviderAccountAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)
  const reactivityKeys = useMemo(() => [keys.provider(provider)], [provider])

  const refresh = useCallback(
    async (force: boolean) => {
      setRefreshing(true)
      const exit = await check({ payload: { provider, refresh: force }, reactivityKeys })
      setRefreshing(false)
      return failure(exit)
    },
    [check, provider, reactivityKeys],
  )

  const add = useCallback(
    async (name: string, configDir?: string) => {
      const payload = configDir === undefined ? { provider, name } : { provider, name, configDir }
      return failure(await addAccount({ payload, reactivityKeys }))
    },
    [addAccount, provider, reactivityKeys],
  )

  const remove = useCallback(
    async (accountId: string) =>
      failure(await removeAccount({ payload: { provider, accountId }, reactivityKeys })),
    [removeAccount, provider, reactivityKeys],
  )

  const setActive = useCallback(
    async (accountId: string) =>
      failure(await setActiveAccount({ payload: { provider, accountId }, reactivityKeys })),
    [setActiveAccount, provider, reactivityKeys],
  )

  return { result, refresh, refreshing, add, remove, setActive }
}
