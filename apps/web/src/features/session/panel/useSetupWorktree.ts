import { useAtomSet } from "@effect/atom-react"
import type { Session } from "@humanity/contracts"
import { useState } from "react"
import { keys } from "@/lib/rpc"
import { setupWorktreeAtom } from "../atoms.ts"
import { isBusy } from "../state.ts"
import { failureMessage } from "@/lib/errors"

export function useSetupWorktree(session: Session) {
  const setup = useAtomSet(setupWorktreeAtom, { mode: "promiseExit" })
  const [pending, setPending] = useState(false)

  const available = !session.inWorktree && session.status !== "ended"
  const busy = isBusy(session.status)

  const run = async (): Promise<string | undefined> => {
    setPending(true)
    const exit = await setup({
      payload: { sessionId: session.id },
      reactivityKeys: [
        keys.sessions(session.projectId),
        keys.git(session.projectId),
        keys.sessionDiff(session.id),
        keys.sessionCommits(session.id),
        keys.publication(session.id),
      ],
    })
    setPending(false)
    return failureMessage(exit)
  }

  return { available, busy, pending, run }
}
