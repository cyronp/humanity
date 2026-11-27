import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useCallback, useState } from "react"
import { keys } from "@/lib/rpc"
import {
  githubConnectionAtom,
  refreshGitHubConnectionAtom,
  removeGitHubTokenAtom,
  setGitHubTokenAtom,
} from "./atoms.ts"
import { failureMessage } from "@/lib/errors"

const reactivityKeys = [keys.github]

export function useGitHubConnection() {
  const result = useAtomValue(githubConnectionAtom)
  const check = useAtomSet(refreshGitHubConnectionAtom, { mode: "promiseExit" })
  const setToken = useAtomSet(setGitHubTokenAtom, { mode: "promiseExit" })
  const dropToken = useAtomSet(removeGitHubTokenAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const exit = await check({ payload: { refresh: true }, reactivityKeys })
    setRefreshing(false)
    return failureMessage(exit)
  }, [check])

  const saveToken = useCallback(
    async (token: string) => {
      const exit = await setToken({ payload: { token }, reactivityKeys })
      return failureMessage(exit)
    },
    [setToken],
  )

  const removeToken = useCallback(async () => {
    const exit = await dropToken({ payload: undefined, reactivityKeys })
    return failureMessage(exit)
  }, [dropToken])

  return { result, refresh, refreshing, saveToken, removeToken }
}
