import {
  type AgentProvider,
  type Autonomy,
  DEFAULT_PROVIDER,
  type ModelDefault,
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
  project?: {
    readonly defaultAutonomy: Autonomy | null
    readonly settings?: { readonly defaultModel: ModelDefault | null }
  },
): ThreadDefaults => {
  const last = sessions[0]
  const chosen = project?.settings?.defaultModel ?? pinned.model
  const provider = chosen?.provider ?? last?.provider ?? DEFAULT_PROVIDER
  const wanted = chosen === null ? last?.model : chosen.model
  const known = models[provider]
  const offered =
    wanted === undefined ||
    wanted === null ||
    known === undefined ||
    known.some((model) => model.value === wanted)
  return {
    provider,
    model: offered ? (wanted ?? null) : null,
    effort:
      pinned.effort === null
        ? (last?.effort ?? null)
        : pinned.effort === "default"
          ? null
          : pinned.effort,
    autonomy: newThreadAutonomy(project, pinned),
  }
}
