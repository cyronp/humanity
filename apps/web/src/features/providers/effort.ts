import type { ReasoningEffort } from "@humanity/contracts"

export const DEFAULT_EFFORT = "default"

export interface EffortOption {
  readonly value: ReasoningEffort | typeof DEFAULT_EFFORT
  readonly label: string
  readonly description?: string
}

export const EFFORT_OPTIONS: ReadonlyArray<EffortOption> = [
  {
    value: DEFAULT_EFFORT,
    label: "Default",
    description: "The effort the model picks on its own.",
  },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra high" },
  {
    value: "max",
    label: "Max",
    description: "As much as the model allows. Runs as High where Max is not supported.",
  },
]

export const effortLabel = (effort: ReasoningEffort | null): string =>
  EFFORT_OPTIONS.find((option) => option.value === (effort ?? DEFAULT_EFFORT))?.label ??
  effort ??
  "Default"

export const effortOptionsFor = (
  efforts: ReadonlyArray<ReasoningEffort> | undefined,
): ReadonlyArray<EffortOption> =>
  efforts === undefined
    ? EFFORT_OPTIONS
    : EFFORT_OPTIONS.filter(
        (option) => option.value === DEFAULT_EFFORT || efforts.includes(option.value),
      )

export const effortTone = (effort: ReasoningEffort | null): string | undefined =>
  effort === "high"
    ? "text-blue-600 dark:text-blue-400"
    : effort === "xhigh"
      ? "text-fuchsia-500 dark:text-fuchsia-400"
      : effort === "max"
        ? "text-purple-600 dark:text-purple-400"
        : undefined
