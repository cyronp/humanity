export interface ShowTerminalRequest {
  readonly terminal: string
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

export const findTerminal = <T extends { readonly id: string; readonly ordinal: number }>(
  terminals: ReadonlyArray<T>,
  reference: string,
): T | undefined => {
  const trimmed = reference.trim().replace(/^#/, "")
  return /^\d+$/.test(trimmed)
    ? terminals.find((terminal) => terminal.ordinal === Number(trimmed))
    : terminals.find((terminal) => terminal.id === trimmed)
}
