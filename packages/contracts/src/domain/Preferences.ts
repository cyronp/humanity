import { Schema } from "effect"
import { Autonomy, DEFAULT_AUTONOMY } from "./Policy.ts"
import { ReasoningEffort } from "./Session.ts"

/**
 * A reasoning effort that can be pinned. `"default"` is the model's own
 * choice, pinned: it is not the same as having no pin.
 */
export const PinnedEffort = Schema.Union([ReasoningEffort, Schema.Literal("default")])
export type PinnedEffort = typeof PinnedEffort.Type

/**
 * What the human pinned as the start of every new thread, in every project.
 * At most one value is pinned per setting. An effort without a pin is `null`
 * and follows the last thread; an autonomy without a pin is `DEFAULT_AUTONOMY`.
 */
export const PinnedDefaults = Schema.Struct({
  autonomy: Schema.NullOr(Autonomy),
  effort: Schema.NullOr(PinnedEffort),
})
export type PinnedDefaults = typeof PinnedDefaults.Type

export const NO_PINS: PinnedDefaults = { autonomy: null, effort: null }

/**
 * The autonomy a new thread starts with: the project's own default, else the
 * one the human pinned for every project, else `DEFAULT_AUTONOMY`. Never the
 * mode another thread was left in.
 */
export const newThreadAutonomy = (
  project: { readonly defaultAutonomy: Autonomy | null } | undefined,
  pinned: Pick<PinnedDefaults, "autonomy">,
): Autonomy => project?.defaultAutonomy ?? pinned.autonomy ?? DEFAULT_AUTONOMY

/** Pins `value` for one setting, or removes the pin when `value` is the pinned one. */
export const togglePin = <Key extends keyof PinnedDefaults>(
  pinned: PinnedDefaults,
  key: Key,
  value: NonNullable<PinnedDefaults[Key]>,
): PinnedDefaults => ({ ...pinned, [key]: pinned[key] === value ? null : value })
