const pending = new Map<string, string>()
const openers = new Set<(sessionId: string) => void>()

export const requestOpenFile = (sessionId: string, path: string): void => {
  pending.set(sessionId, path)
  for (const opener of openers) opener(sessionId)
}

export const onOpenFileRequest = (listener: (sessionId: string) => void) => {
  openers.add(listener)
  return () => void openers.delete(listener)
}

export const takeOpenFileRequest = (sessionId: string): string | undefined => {
  const path = pending.get(sessionId)
  pending.delete(sessionId)
  return path
}
