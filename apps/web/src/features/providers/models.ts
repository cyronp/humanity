import type { AgentProvider } from "@humanity/contracts"

export const DEFAULT_MODEL = "default"

export interface ReportedModel {
  readonly value: string
  readonly displayName: string
  readonly description: string
}

export interface PickerModel extends ReportedModel {
  readonly provider: AgentProvider
  readonly legacy: boolean
}

export interface ModelChoice {
  readonly provider: AgentProvider
  readonly model: string | null
  readonly accountId?: string | undefined
}

const DEFAULT_ROW: Record<AgentProvider, ReportedModel> = {
  "claude-code": {
    value: DEFAULT_MODEL,
    displayName: "Default (recommended)",
    description: "The model Claude Code picks for your account",
  },
  codex: {
    value: DEFAULT_MODEL,
    displayName: "Default",
    description: "The model your Codex settings pick",
  },
  kiro: {
    value: DEFAULT_MODEL,
    displayName: "Default",
    description: "The model your Kiro settings pick",
  },
  antigravity: {
    value: DEFAULT_MODEL,
    displayName: "Default",
    description: "The model your Antigravity settings pick",
  },
}

export const pickerModels = (
  provider: AgentProvider,
  reported: ReadonlyArray<ReportedModel>,
): Array<PickerModel> => {
  const rows = reported.some((model) => model.value === DEFAULT_MODEL)
    ? reported
    : [DEFAULT_ROW[provider], ...reported]
  return rows.map(({ value, displayName, description }) => ({
    provider,
    value,
    displayName,
    description,
    legacy: provider === "claude-code" && value.startsWith("claude-"),
  }))
}

export const offeredProviders = (
  all: ReadonlyArray<AgentProvider>,
  current: AgentProvider,
  connected: Readonly<Record<AgentProvider, boolean>>,
  locked: boolean,
): Array<AgentProvider> =>
  all.filter((provider) => provider === current || (!locked && connected[provider]))

export const modelKey = (model: Pick<PickerModel, "provider" | "value">): string =>
  model.provider === "claude-code" ? model.value : `${model.provider}:${model.value}`

export const shortModelName = (model: ReportedModel): string =>
  model.displayName.replace(/\s*\(recommended\)$/i, "")

export const modelDisplayName = (
  models: ReadonlyArray<PickerModel>,
  value: string | null | undefined,
): string => {
  const wanted = value ?? DEFAULT_MODEL
  const found = models.find((model) => model.value === wanted)
  if (found !== undefined) return shortModelName(found)
  return wanted === DEFAULT_MODEL ? "Default" : wanted
}
