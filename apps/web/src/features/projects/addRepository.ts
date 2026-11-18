import { useSyncExternalStore } from "react"

let open = false
const listeners = new Set<() => void>()

const setOpen = (next: boolean): void => {
  open = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const openAddRepository = (): void => setOpen(true)

export const closeAddRepository = (): void => setOpen(false)

export const useAddRepositoryOpen = (): boolean => useSyncExternalStore(subscribe, () => open)
