import { type SessionId, TerminalId } from "@humanity/contracts"
import { Effect, Schedule, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

/** A thread's terminals, kept up to date while something looks at them. */
export const terminalsAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.runtime.atom(
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Terminals.watch", { sessionId }))),
    ).pipe(Stream.retry(Schedule.spaced("1 second"))),
  ),
)

export interface AttachKey {
  readonly terminalId: string
  readonly attachmentId: string
  readonly cols: number
  readonly rows: number
}

export const attachKey = (key: AttachKey) => JSON.stringify(key)

/**
 * One view's attachment to a terminal: the screen, then what it prints. If the connection drops
 * it attaches again with the same id and starts over from a fresh screen.
 */
export const attachAtom = Atom.family((key: string) => {
  const { terminalId, attachmentId, cols, rows } = JSON.parse(key) as AttachKey
  return HumanityClient.runtime.atom(
    Stream.unwrap(
      HumanityClient.use((client) =>
        Effect.succeed(
          client("Terminals.attach", {
            terminalId: TerminalId.make(terminalId),
            attachmentId,
            cols,
            rows,
          }),
        ),
      ),
    ).pipe(Stream.retry(Schedule.spaced("1 second"))),
  )
})

export const openTerminalAtom = HumanityClient.mutation("Terminals.open")
export const closeTerminalAtom = HumanityClient.mutation("Terminals.close")
export const renameTerminalAtom = HumanityClient.mutation("Terminals.rename")
export const restartTerminalAtom = HumanityClient.mutation("Terminals.restart")
export const writeTerminalAtom = HumanityClient.mutation("Terminals.write")
export const resizeTerminalAtom = HumanityClient.mutation("Terminals.resize")
export const ackTerminalAtom = HumanityClient.mutation("Terminals.ack")

export const shellsAtom = HumanityClient.query("Terminals.shells", undefined)

export const terminalPreferencesAtom = HumanityClient.query("Preferences.getTerminal", undefined, {
  reactivityKeys: [keys.preferences],
})
export const setTerminalPreferencesAtom = HumanityClient.mutation("Preferences.setTerminal")
