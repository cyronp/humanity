import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useCallback, useState } from "react"
import { keys } from "@/lib/rpc"
import {
  gitlabConnectionAtom,
  refreshGitLabConnectionAtom,
  removeGitLabTokenAtom,
  setGitLabTokenAtom,
} from "./atoms.ts"
import { failureMessage } from "@/lib/errors"

const reactivityKeys = [keys.gitlab]

export function useGitLabConnection() {
  const result = useAtomValue(gitlabConnectionAtom)
  const check = useAtomSet(refreshGitLabConnectionAtom, { mode: "promiseExit" })
  const setToken = useAtomSet(setGitLabTokenAtom, { mode: "promiseExit" })
  const dropToken = useAtomSet(removeGitLabTokenAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const exit = await check({ payload: { refresh: true }, reactivityKeys })
    setRefreshing(false)
    return failureMessage(exit)
  }, [check])

  const saveToken = useCallback(
    async (token: string, host: string) => {
      const exit = await setToken({ payload: { token, host }, reactivityKeys })
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
