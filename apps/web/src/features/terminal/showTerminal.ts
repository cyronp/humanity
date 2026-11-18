/**
 * "Show terminal" from a tool call in the chat: opens the dock on that terminal. The page's
 * frame listens; the dock picks the tab. A terminal is named as the agent named it: its number in
 * the thread (`2`, `#2`) or its id.
 */
export interface ShowTerminalRequest {
  readonly terminal: string
  /** Tells two requests for the same terminal apart. */
  readonly nonce: number
}

const listeners = new Set<(request: ShowTerminalRequest) => void>()
let nonce = 0

export const showTerminal = (terminal: string) => {
  const request = { terminal, nonce: ++nonce }
  for (const listener of listeners) listener(request)
}

export const onShowTerminal = (listener: (request: ShowTerminalRequest) => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** The terminal a reference names among `terminals`: by number, else by id. */
export const findTerminal = <T extends { readonly id: string; readonly ordinal: number }>(
  terminals: ReadonlyArray<T>,
  reference: string,
): T | undefined => {
  const trimmed = reference.trim().replace(/^#/, "")
  return /^\d+$/.test(trimmed)
    ? terminals.find((terminal) => terminal.ordinal === Number(trimmed))
    : terminals.find((terminal) => terminal.id === trimmed)
}
