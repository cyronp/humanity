import type { ChecksResult } from "@humanity/contracts"
import { useSyncExternalStore } from "react"

export type ChecksState =
  | { readonly _tag: "running" }
  | { readonly _tag: "done"; readonly result: ChecksResult }
  | { readonly _tag: "error"; readonly message: string }

const states = new Map<string, ChecksState>()
const listeners = new Set<() => void>()

const publish = () => {
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const checksState = (sessionId: string): ChecksState | undefined => states.get(sessionId)

export const setChecksState = (sessionId: string, state: ChecksState | undefined) => {
  if (state === undefined) states.delete(sessionId)
  else states.set(sessionId, state)
  publish()
}

export const useChecksState = (sessionId: string): ChecksState | undefined =>
  useSyncExternalStore(subscribe, () => states.get(sessionId))

export const checksRunning = (sessionId: string): boolean =>
  states.get(sessionId)?._tag === "running"

export const checksSummary = (state: ChecksState): string => {
  if (state._tag === "running") return "Running the checks…"
  if (state._tag === "error") return state.message
  const { result } = state
  switch (result.outcome) {
    case "passed":
      return "The checks passed."
    case "failed":
      return result.exitCode === null
        ? "The checks failed."
        : `The checks failed with exit code ${result.exitCode}.`
    case "timeout":
      return "The checks are still running after 30 minutes. They go on in their terminal."
    case "untracked":
      return "The checks run in a terminal whose shell does not report when a command ends, so Humanity cannot tell how they ended."
  }
}
