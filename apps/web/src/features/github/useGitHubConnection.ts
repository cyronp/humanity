import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Exit } from "effect"
import { useCallback, useState } from "react"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  githubConnectionAtom,
  refreshGitHubConnectionAtom,
  removeGitHubTokenAtom,
  setGitHubTokenAtom,
} from "./atoms.ts"

const reactivityKeys = [keys.github]

/**
 * The GitHub connection and what can be done with it. Every action resolves
 * to an error message, or `undefined` when it worked.
 */
export function useGitHubConnection() {
  const result = useAtomValue(githubConnectionAtom)
  const check = useAtomSet(refreshGitHubConnectionAtom, { mode: "promiseExit" })
  const setToken = useAtomSet(setGitHubTokenAtom, { mode: "promiseExit" })
  const dropToken = useAtomSet(removeGitHubTokenAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)

  /** Looks the token up again right away, so a login just made in a terminal shows up. */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    const exit = await check({ payload: { refresh: true }, reactivityKeys })
    setRefreshing(false)
    return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
  }, [check])

  const saveToken = useCallback(
    async (token: string) => {
      const exit = await setToken({ payload: { token }, reactivityKeys })
      return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
    },
    [setToken],
  )

  const removeToken = useCallback(async () => {
    const exit = await dropToken({ payload: undefined, reactivityKeys })
    return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
  }, [dropToken])

  return { result, refresh, refreshing, saveToken, removeToken }
}
