import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { NO_PINS, type PinnedDefaults, togglePin } from "@humanity/contracts"
import { Exit } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { describeCause } from "@/lib/errors"
import { HumanityClient, keys } from "@/lib/rpc"

export const pinnedDefaultsAtom = HumanityClient.query("Preferences.getPinnedDefaults", undefined, {
  reactivityKeys: [keys.preferences],
})

const setPinnedDefaultsAtom = HumanityClient.mutation("Preferences.setPinnedDefaults")

export const usePinnedDefaults = () => {
  const result = useAtomValue(pinnedDefaultsAtom)
  const save = useAtomSet(setPinnedDefaultsAtom, { mode: "promiseExit" })
  const [error, setError] = useState<string>()
  const ready = AsyncResult.isSuccess(result)
  const pinned: PinnedDefaults = ready ? result.value : NO_PINS

  const toggle = async <Key extends keyof PinnedDefaults>(
    key: Key,
    value: NonNullable<PinnedDefaults[Key]>,
  ) => {
    if (!ready) return
    setError(undefined)
    const exit = await save({
      payload: { pinned: togglePin(pinned, key, value) },
      reactivityKeys: [keys.preferences],
    })
    if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
  }

  return { pinned, ready, toggle, error }
}
