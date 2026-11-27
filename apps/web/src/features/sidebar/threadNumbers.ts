import type { Session } from "@humanity/contracts"
import { modPressed, type ShortcutKey } from "@/lib/shortcuts"
import { selectThreads, type Thread, type ThreadFilter } from "./threadFilter.ts"
import { threadTree } from "./threadTree.ts"

export interface NumberKey extends ShortcutKey {
  readonly code: string
}

const LAST = 9

export const threadNumberOf = (event: NumberKey, mac: boolean): number | undefined => {
  if (!modPressed(event, mac) || event.altKey || event.shiftKey) return undefined
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1] ?? /^[1-9]$/.exec(event.key)?.[0]
  return digit === undefined ? undefined : Number(digit)
}

export const numberedThreads = (
  threads: ReadonlyArray<Thread>,
  filter: ThreadFilter,
): ReadonlyArray<Session> =>
  threadTree(selectThreads(threads, "", filter)).map((node) => node.thread.session)

export const threadAtNumber = (
  threads: ReadonlyArray<Session>,
  number: number,
): Session | undefined => (number === LAST ? threads.at(-1) : threads[number - 1])
