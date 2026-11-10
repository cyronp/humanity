import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Exit } from "effect"
import { useCallback, useState } from "react"
import { describeCause } from "@/lib/errors"
import { keys } from "@/lib/rpc"
import { claudeStatusAtom, refreshClaudeStatusAtom } from "./atoms.ts"

/** The Claude status plus a "check again" action that reports its own failure. */
export function useClaudeStatus() {
  const result = useAtomValue(claudeStatusAtom)
  const check = useAtomSet(refreshClaudeStatusAtom, { mode: "promiseExit" })
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string>()

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const exit = await check({ payload: { refresh: true }, reactivityKeys: [keys.claude] })
    setRefreshing(false)
    setRefreshError(Exit.isFailure(exit) ? describeCause(exit.cause) : undefined)
  }, [check])

  return { result, refresh, refreshing, refreshError }
}
