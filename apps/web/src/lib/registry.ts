import { scheduleTask } from "@effect/atom-react"
import { AtomRegistry } from "effect/reactivity"

export const registry = AtomRegistry.make({ scheduleTask })
