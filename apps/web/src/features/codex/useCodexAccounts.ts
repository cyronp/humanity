import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Exit } from "effect"
import { useCallback, useState } from "react"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  addCodexAccountAtom,
  codexAccountsAtom,
  refreshCodexAccountsAtom,
  removeCodexAccountAtom,
  setActiveCodexAccountAtom,
} from "./atoms.ts"

const reactivityKeys = [keys.codex]

export function useCodexAccounts() {
  const result = useAtomValue(codexAccountsAtom)
  const check = useAtomSet(refreshCodexAccountsAtom, { mode: "promiseExit" })
  const addAccount = useAtomSet(addCodexAccountAtom, { mode: "promiseExit" })
  const removeAccount = useAtomSet(removeCodexAccountAtom, { mode: "promiseExit" })
  const setActiveAccount = useAtomSet(setActiveCodexAccountAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(
    async (force: boolean) => {
      setRefreshing(true)
      const exit = await check({ payload: { refresh: force }, reactivityKeys })
      setRefreshing(false)
      return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
    },
    [check],
  )

  const add = useCallback(
    async (name: string, configDir?: string) => {
      const payload = configDir === undefined ? { name } : { name, configDir }
      const exit = await addAccount({ payload, reactivityKeys })
      return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
    },
    [addAccount],
  )

  const remove = useCallback(
    async (accountId: string) => {
      const exit = await removeAccount({ payload: { accountId }, reactivityKeys })
      return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
    },
    [removeAccount],
  )

  const setActive = useCallback(
    async (accountId: string) => {
      const exit = await setActiveAccount({ payload: { accountId }, reactivityKeys })
      return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
    },
    [setActiveAccount],
  )

  return { result, refresh, refreshing, add, remove, setActive }
}
