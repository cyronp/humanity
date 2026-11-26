import { Atom } from "effect/reactivity"
import { readStoredFilter } from "./threadFilter.ts"

export const threadFilterAtom = Atom.make(readStoredFilter()).pipe(Atom.keepAlive)
