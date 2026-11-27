import { useAtomValue } from "@effect/atom-react"
import { DEFAULT_HISTORY_PREFERENCES } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"
import { useAction } from "@/lib/useAction"

const historyPreferencesAtom = HumanityClient.query("Preferences.getHistory", undefined, {
  reactivityKeys: [keys.preferences],
})

const setHistoryPreferencesAtom = HumanityClient.mutation("Preferences.setHistory")

export const useHistoryImport = () => {
  const result = useAtomValue(historyPreferencesAtom)
  const { run: save, error } = useAction(setHistoryPreferencesAtom)
  const ready = AsyncResult.isSuccess(result)
  const enabled = (ready ? result.value : DEFAULT_HISTORY_PREFERENCES).importFromCli

  const setEnabled = async (importFromCli: boolean) => {
    await save({
      payload: { history: { importFromCli } },
      reactivityKeys: [keys.preferences],
    })
  }

  return { enabled, ready, setEnabled, error }
}
