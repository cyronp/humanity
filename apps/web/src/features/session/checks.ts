import type { ChecksResult } from "@humanity/contracts"
import { useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import { registry } from "@/lib/registry"

export type ChecksState =
  | { readonly _tag: "running" }
  | { readonly _tag: "done"; readonly result: ChecksResult }
  | { readonly _tag: "error"; readonly message: string }

const checksAtom = Atom.family((_sessionId: string) =>
  Atom.make<ChecksState | undefined>(undefined).pipe(Atom.keepAlive),
)

export const setChecksState = (sessionId: string, state: ChecksState | undefined) =>
  registry.set(checksAtom(sessionId), state)

export const useChecksState = (sessionId: string): ChecksState | undefined =>
  useAtomValue(checksAtom(sessionId))

export const checksRunning = (sessionId: string): boolean =>
  registry.get(checksAtom(sessionId))?._tag === "running"

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
