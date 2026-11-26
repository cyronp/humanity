export const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export const writeStored = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {}
}

export const readStoredJson = (key: string): unknown => {
  const raw = readStored(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

export const writeStoredJson = (key: string, value: unknown): void =>
  writeStored(key, JSON.stringify(value))
