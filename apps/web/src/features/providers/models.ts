import type { AgentProvider } from "@humanity/contracts"

/** The provider's own choice. Picking it sends no model, so the session follows the provider. */
export const DEFAULT_MODEL = "default"

/** A model as a provider reports it (`Claude.status`, `Codex.status`). */
export interface ReportedModel {
  readonly value: string
  readonly displayName: string
  readonly description: string
}

export interface PickerModel extends ReportedModel {
  readonly provider: AgentProvider
  /** An older model, kept behind "Legacy models". */
  readonly legacy: boolean
}

/** What the picker hands back: the provider a thread runs on and its model, `null` for the default. */
export interface ModelChoice {
  readonly provider: AgentProvider
  readonly model: string | null
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
}

/**
 * The rows a provider shows: its default first, then what it reported, in its
 * order. Claude Code lists its current models by alias (`opus`, `sonnet`, ...)
 * and older ones by their full, pinned id (`claude-sonnet-5`, ...).
 */
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

/** One name per row across providers. Claude Code's stay bare, as they were starred before Codex. */
export const modelKey = (model: Pick<PickerModel, "provider" | "value">): string =>
  model.provider === "claude-code" ? model.value : `${model.provider}:${model.value}`

/** The short name for tight spaces: "Default (recommended)" reads "Default". */
export const shortModelName = (model: ReportedModel): string =>
  model.displayName.replace(/\s*\(recommended\)$/i, "")
