import {
  type AgentProvider,
  type Autonomy,
  DEFAULT_PROVIDER,
  newThreadAutonomy,
  NO_PINS,
  type PinnedDefaults,
  type ReasoningEffort,
  type Session,
} from "@humanity/contracts"

/** What a new thread starts with, until the human picks something else. */
export interface ThreadDefaults {
  readonly provider: AgentProvider
  readonly model: string | null
  readonly effort: ReasoningEffort | null
  readonly autonomy: Autonomy
}

/** What each provider offers now; a provider is absent while that is still loading. */
export type OfferedModels = Readonly<
  Partial<Record<AgentProvider, ReadonlyArray<{ readonly value: string }>>>
>

/**
 * A new thread starts on the provider, model and reasoning effort the last
 * one was left with; a pinned effort wins over the last thread's. Its
 * autonomy is never inherited from a thread: it is the project's default,
 * else the pinned one, else Auto mode. The branch follows the checkout.
 *
 * `sessions` is most recently active first. A model its provider no longer
 * offers falls back to that provider's default.
 */
export const threadDefaults = (
  sessions: ReadonlyArray<Session>,
  models: OfferedModels = {},
  pinned: PinnedDefaults = NO_PINS,
  project?: { readonly defaultAutonomy: Autonomy | null },
): ThreadDefaults => {
  const last = sessions[0]
  const provider = last?.provider ?? DEFAULT_PROVIDER
  const known = models[provider]
  const offered =
    last === undefined ||
    last.model === null ||
    known === undefined ||
    known.some((model) => model.value === last.model)
  return {
    provider,
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
