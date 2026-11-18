import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Exit } from "effect"
import { useCallback, useState } from "react"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import {
  gitlabConnectionAtom,
  refreshGitLabConnectionAtom,
  removeGitLabTokenAtom,
  setGitLabTokenAtom,
} from "./atoms.ts"

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
    return Exit.isFailure(exit) ? describeCause(exit.cause) : undefined
  }, [check])

  const saveToken = useCallback(
    async (token: string, host: string) => {
      const exit = await setToken({ payload: { token, host }, reactivityKeys })
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
