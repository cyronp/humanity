import { Schema } from "effect"
import { Autonomy, DEFAULT_AUTONOMY } from "./Policy.ts"
import { ReasoningEffort } from "./Session.ts"

export const PinnedEffort = Schema.Union([ReasoningEffort, Schema.Literal("default")])
export type PinnedEffort = typeof PinnedEffort.Type

export const PinnedDefaults = Schema.Struct({
  autonomy: Schema.NullOr(Autonomy),
  effort: Schema.NullOr(PinnedEffort),
})
export type PinnedDefaults = typeof PinnedDefaults.Type

export const NO_PINS: PinnedDefaults = { autonomy: null, effort: null }

export const newThreadAutonomy = (
  project: { readonly defaultAutonomy: Autonomy | null } | undefined,
  pinned: Pick<PinnedDefaults, "autonomy">,
): Autonomy => project?.defaultAutonomy ?? pinned.autonomy ?? DEFAULT_AUTONOMY

export const togglePin = <Key extends keyof PinnedDefaults>(
  pinned: PinnedDefaults,
  key: Key,
  value: NonNullable<PinnedDefaults[Key]>,
): PinnedDefaults => ({ ...pinned, [key]: pinned[key] === value ? null : value })

export const HistoryPreferences = Schema.Struct({
  importFromCli: Schema.Boolean,
})
export type HistoryPreferences = typeof HistoryPreferences.Type

export const DEFAULT_HISTORY_PREFERENCES: HistoryPreferences = { importFromCli: true }

export const ToolsPreferences = Schema.Struct({
  terminals: Schema.Boolean,
  openThread: Schema.Boolean,
})
export type ToolsPreferences = typeof ToolsPreferences.Type

export const DEFAULT_TOOLS_PREFERENCES: ToolsPreferences = { terminals: true, openThread: true }

export const HUMANITY_TOOL_TOKENS: Readonly<Record<keyof ToolsPreferences, number>> = {
  terminals: 1_400,
  openThread: 600,
}
