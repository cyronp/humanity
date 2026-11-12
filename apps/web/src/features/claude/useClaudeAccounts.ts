import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Exit } from "effect"
import { useCallback, useState } from "react"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  addClaudeAccountAtom,
  claudeAccountsAtom,
  refreshClaudeAccountsAtom,
  removeClaudeAccountAtom,
  setActiveClaudeAccountAtom,
} from "./atoms.ts"

const reactivityKeys = [keys.claude]

/**
 * The Claude accounts and what can be done with them. Every action resolves
 * to an error message, or `undefined` when it worked.
 */
export function useClaudeAccounts() {
  const result = useAtomValue(claudeAccountsAtom)
  const check = useAtomSet(refreshClaudeAccountsAtom, { mode: "promiseExit" })
  const addAccount = useAtomSet(addClaudeAccountAtom, { mode: "promiseExit" })
  const removeAccount = useAtomSet(removeClaudeAccountAtom, { mode: "promiseExit" })
  const setActiveAccount = useAtomSet(setActiveClaudeAccountAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)

  /** `force` starts Claude Code again for every account; without it the daemon's short cache answers. */
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
    async (name: string) => {
      const exit = await addAccount({ payload: { name }, reactivityKeys })
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
