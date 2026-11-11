import { Schema } from "effect"
import { Autonomy } from "./Policy.ts"
import { ReasoningEffort } from "./Session.ts"

/**
 * A reasoning effort that can be pinned. `"default"` is the model's own
 * choice, pinned: it is not the same as having no pin.
 */
export const PinnedEffort = Schema.Union([ReasoningEffort, Schema.Literal("default")])
export type PinnedEffort = typeof PinnedEffort.Type

/**
 * What the human pinned as the start of every new thread. A setting without a
 * pin is `null` and follows the last thread instead. At most one value is
 * pinned per setting.
 */
export const PinnedDefaults = Schema.Struct({
  autonomy: Schema.NullOr(Autonomy),
  effort: Schema.NullOr(PinnedEffort),
})
export type PinnedDefaults = typeof PinnedDefaults.Type

export const NO_PINS: PinnedDefaults = { autonomy: null, effort: null }

/** Pins `value` for one setting, or removes the pin when `value` is the pinned one. */
export const togglePin = <Key extends keyof PinnedDefaults>(
  pinned: PinnedDefaults,
  key: Key,
  value: NonNullable<PinnedDefaults[Key]>,
): PinnedDefaults => ({ ...pinned, [key]: pinned[key] === value ? null : value })
