import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_HISTORY_PREFERENCES } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { describeCause } from "@/lib/errors"
import { HumanityClient, keys } from "@/lib/rpc"

/** Whether conversations held in the agent's CLI become threads, kept by the daemon. */
const historyPreferencesAtom = HumanityClient.query("Preferences.getHistory", undefined, {
  reactivityKeys: [keys.preferences],
})

const setHistoryPreferencesAtom = HumanityClient.mutation("Preferences.setHistory")

/** The import of the CLI's older threads and the way to turn it on or off. */
export const useHistoryImport = () => {
  const result = useAtomValue(historyPreferencesAtom)
  const save = useAtomSet(setHistoryPreferencesAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const ready = AsyncResult.isSuccess(result)
  const enabled = (ready ? result.value : DEFAULT_HISTORY_PREFERENCES).importFromCli

  const setEnabled = async (importFromCli: boolean) => {
    setError(undefined)
    const exit = await save({
      payload: { history: { importFromCli } },
      reactivityKeys: [keys.preferences],
    })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return { enabled, ready, setEnabled, error }
}
