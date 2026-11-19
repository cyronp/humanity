import { useAtomValue } from "@effect/atom-react"
import {
  type LocalServer,
  mergeOffers,
  type OfferedUrl,
  type SessionId,
  type TerminalInfo,
  terminalLabel,
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
import { useLocalServers } from "./ServerList.tsx"

export interface BrowserState {
  readonly sessionId: SessionId
  readonly offers: ReadonlyArray<OfferedUrl>
  /** The name of each of the thread's terminals, by id. */
  readonly terminalNames: ReadonlyMap<string, string>
  readonly memory: BrowserMemory
  readonly unseen: boolean
  /** Changes the remembered tabs; the change is stored at once. */
  readonly change: (next: (memory: BrowserMemory) => BrowserMemory) => void
  readonly onSeen: () => void
}

const NO_TERMINALS: ReadonlyArray<TerminalInfo> = []

/** The servers the thread's own terminals started, as offers to see. */
const threadServers = (
  servers: ReadonlyArray<LocalServer>,
  names: ReadonlyMap<string, string>,
): ReadonlyArray<OfferedUrl> =>
  servers
    .filter((server) => server.terminalId !== null && names.has(server.terminalId))
    .map((server) => ({ url: server.url, seenAt: "" }))

/**
 * A thread's Browser: the local addresses its terminals and `Bash` calls offer, newest first, the
 * address it last showed, and whether an offer, or a server its terminals started, is new since the
 * human last looked.
 */
export const useBrowser = (
  sessionId: SessionId,
  toolCalls: Readonly<Record<string, ToolCall>>,
): BrowserState => {
  const owner: TerminalOwner = { _tag: "Session", sessionId }
  const result = useAtomValue(terminalsAtom(JSON.stringify(owner)))
  const terminals = AsyncResult.isSuccess(result) ? result.value : NO_TERMINALS
  const terminalNames = useMemo(
    () => new Map(terminals.map((terminal) => [terminal.id as string, terminalLabel(terminal)])),
    [terminals],
  )
  const bash = useMemo(() => bashOffers(Object.values(toolCalls)), [toolCalls])
  const offers = useMemo(
    () =>
      mergeOffers(
        terminals.flatMap((terminal) => terminal.urls),
        bash,
      ),
    [terminals, bash],
  )
  const servers = useLocalServers(false)
  const watched = useMemo(
    () => [...offers, ...threadServers(servers, terminalNames)],
    [offers, servers, terminalNames],
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

  const onSeen = useCallback(
    () => change((current) => markSeen(current, watched)),
    [change, watched],
  )

  return {
    sessionId,
    offers,
    terminalNames,
    memory,
    unseen: hasUnseen(memory, watched),
    change,
    onSeen,
  }
}
