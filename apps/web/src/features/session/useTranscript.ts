import { useAtomSet } from "@effect/atom-react"
import { Exit } from "effect"
import { useCallback, useMemo, useState } from "react"
import { describeCause } from "@/lib/errors"
import { earlierMessagesAtom } from "./atoms.ts"
import { addEarlierPage, type EarlierPages, joinEarlier, type SessionView } from "./state.ts"

export const useTranscript = (view: SessionView) => {
  const fetchEarlier = useAtomSet(earlierMessagesAtom, { mode: "promiseExit" })
  const [pages, setPages] = useState<EarlierPages>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const { messages, toolCalls, hasEarlier } = view
  const shown = useMemo(
    () => joinEarlier({ messages, toolCalls, hasEarlier }, pages),
    [messages, toolCalls, hasEarlier, pages],
  )

  const sessionId = view.session.id
  const attachedTo = messages[0]?.id
  const before = shown.messages[0]?.id
  const loadEarlier = useCallback(async () => {
    if (attachedTo === undefined || before === undefined) return
    setLoading(true)
    setError(undefined)
    const exit = await fetchEarlier({ payload: { sessionId, before } })
    setLoading(false)
    if (Exit.isFailure(exit)) {
      setError(describeCause(exit.cause))
      return
    }
    setPages((previous) => addEarlierPage(previous, attachedTo, exit.value))
  }, [fetchEarlier, sessionId, attachedTo, before])

  return { ...shown, loadEarlier, loading, error }
}
