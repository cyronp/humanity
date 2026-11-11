import {
  type Autonomy,
  type ClaudeModel,
  DEFAULT_AUTONOMY,
  NO_PINS,
  type PinnedDefaults,
  type ReasoningEffort,
  type Session,
} from "@humanity/contracts"

/** What a new thread starts with, until the human picks something else. */
export interface ThreadDefaults {
  readonly model: string | null
  readonly effort: ReasoningEffort | null
  readonly autonomy: Autonomy
}

/**
 * A new thread starts the way the last one was left: its model, reasoning
 * effort and autonomy. A pinned effort or autonomy wins over the last
 * thread's. The branch is not inherited; it follows the checkout.
 *
 * `sessions` is most recently active first. `models` is what Claude Code
 * offers now, or `undefined` while that is still loading: a model it no
 * longer offers falls back to Claude Code's default.
 */
export const threadDefaults = (
  sessions: ReadonlyArray<Session>,
  models: ReadonlyArray<ClaudeModel> | undefined,
  pinned: PinnedDefaults = NO_PINS,
): ThreadDefaults => {
  const last = sessions[0]
  const offered =
    last === undefined ||
    last.model === null ||
    models === undefined ||
    models.some((model) => model.value === last.model)
  return {
    model: offered ? (last?.model ?? null) : null,
    effort:
      pinned.effort === null
        ? (last?.effort ?? null)
        : pinned.effort === "default"
          ? null
          : pinned.effort,
    autonomy: pinned.autonomy ?? last?.autonomy ?? DEFAULT_AUTONOMY,
  }
}
