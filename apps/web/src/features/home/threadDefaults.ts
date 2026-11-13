import {
  type Autonomy,
  type ClaudeModel,
  newThreadAutonomy,
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
 * A new thread starts on the model and reasoning effort the last one was left
 * with; a pinned effort wins over the last thread's. Its autonomy is never
 * inherited from a thread: it is the project's default, else the pinned one,
 * else Auto mode. The branch follows the checkout.
 *
 * `sessions` is most recently active first. `models` is what Claude Code
 * offers now, or `undefined` while that is still loading: a model it no
 * longer offers falls back to Claude Code's default.
 */
export const threadDefaults = (
  sessions: ReadonlyArray<Session>,
  models: ReadonlyArray<ClaudeModel> | undefined,
  pinned: PinnedDefaults = NO_PINS,
  project?: { readonly defaultAutonomy: Autonomy | null },
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
    autonomy: newThreadAutonomy(project, pinned),
  }
}
