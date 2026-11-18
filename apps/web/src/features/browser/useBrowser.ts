import { useAtomValue } from "@effect/atom-react"
import {
  mergeOffers,
  type OfferedUrl,
  type SessionId,
  type TerminalOwner,
  type ToolCall,
} from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { useCallback, useMemo, useState } from "react"
import { terminalsAtom } from "@/features/terminal/atoms"
import {
  bashOffers,
  type BrowserMemory,
  hasUnseen,
  markSeen,
  readMemory,
  storeMemory,
} from "./browser.ts"

export interface BrowserState {
  readonly offers: ReadonlyArray<OfferedUrl>
  readonly remembered: string | null
  readonly unseen: boolean
  readonly onLoad: (url: string) => void
  readonly onSeen: () => void
}

/**
 * A thread's Browser: the local addresses its terminals and `Bash` calls offer, newest first, the
 * address it last showed, and whether an offer is new since the human last looked.
 */
export const useBrowser = (
  sessionId: SessionId,
  toolCalls: Readonly<Record<string, ToolCall>>,
): BrowserState => {
  const owner: TerminalOwner = { _tag: "Session", sessionId }
  const terminals = useAtomValue(terminalsAtom(JSON.stringify(owner)))
  const terminalOffers = AsyncResult.isSuccess(terminals) ? terminals.value : undefined
  const bash = useMemo(() => bashOffers(Object.values(toolCalls)), [toolCalls])
  const offers = useMemo(
    () => mergeOffers(terminalOffers?.flatMap((terminal) => terminal.urls) ?? [], bash),
    [terminalOffers, bash],
  )

  const [state, setState] = useState(() => ({ sessionId, memory: readMemory(sessionId) }))
  const memory: BrowserMemory = state.sessionId === sessionId ? state.memory : readMemory(sessionId)

  const change = useCallback(
    (next: (memory: BrowserMemory) => BrowserMemory) =>
      setState((current) => {
        const from = current.sessionId === sessionId ? current.memory : readMemory(sessionId)
        const changed = next(from)
        if (changed === from && current.sessionId === sessionId) return current
        storeMemory(sessionId, changed)
        return { sessionId, memory: changed }
      }),
    [sessionId],
  )

  const onLoad = useCallback(
    (url: string) => change((current) => (current.url === url ? current : { ...current, url })),
    [change],
  )
  const onSeen = useCallback(() => change((current) => markSeen(current, offers)), [change, offers])

  return { offers, remembered: memory.url, unseen: hasUnseen(memory, offers), onLoad, onSeen }
}
