import { useAtomValue } from "@effect/atom-react"
import { Atom } from "effect/reactivity"
import { registry } from "@/lib/registry"

const openAtom = Atom.make(false).pipe(Atom.keepAlive)

export const openAddRepository = (): void => registry.set(openAtom, true)

export const closeAddRepository = (): void => registry.set(openAtom, false)

export const useAddRepositoryOpen = (): boolean => useAtomValue(openAtom)
