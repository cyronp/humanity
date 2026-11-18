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

export interface ThreadDefaults {
  readonly provider: AgentProvider
  readonly model: string | null
  readonly effort: ReasoningEffort | null
  readonly autonomy: Autonomy
}

export type OfferedModels = Readonly<
  Partial<Record<AgentProvider, ReadonlyArray<{ readonly value: string }>>>
>

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
