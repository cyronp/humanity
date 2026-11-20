import { Effect, Schema } from "effect"
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
  /** The skills of the human's other agents, given through `load_skill` (2026-11-20; on when unset). */
  skills: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
})
export type ToolsPreferences = typeof ToolsPreferences.Type

export const DEFAULT_TOOLS_PREFERENCES: ToolsPreferences = {
  terminals: true,
  openThread: true,
  skills: true,
}

/** Where a local link clicked in a terminal or a command's output opens. */
export const BrowserLinkTarget = Schema.Literals(["browser", "system"])
export type BrowserLinkTarget = typeof BrowserLinkTarget.Type

export const BrowserPreferences = Schema.Struct({ linkTarget: BrowserLinkTarget })
export type BrowserPreferences = typeof BrowserPreferences.Type

export const DEFAULT_BROWSER_PREFERENCES: BrowserPreferences = { linkTarget: "browser" }

export const HUMANITY_TOOL_TOKENS: Readonly<Record<keyof ToolsPreferences, number>> = {
  terminals: 1_400,
  openThread: 600,
  skills: 250,
}

/** What each skill `load_skill` lists adds to `HUMANITY_TOOL_TOKENS.skills`, about. */
export const HUMANITY_TOKENS_PER_SKILL = 60
