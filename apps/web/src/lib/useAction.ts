import { useAtomSet } from "@effect/atom-react"
import { Exit } from "effect"
import type { Atom, AsyncResult } from "effect/reactivity"
import { useCallback, useState } from "react"
import { describeCause } from "./errors.ts"

export const useAction = <A, E, W>(atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>) => {
  const send = useAtomSet(atom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const run = useCallback(
    async (value: W) => {
      setPending(true)
      setError(undefined)
      const exit = await send(value)
      setPending(false)
      if (Exit.isFailure(exit)) setError(describeCause(exit.cause))
      return exit
    },
    [send],
  )
  return { run, pending, error, setError }
}
