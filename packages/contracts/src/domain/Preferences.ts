import { Effect, Schema } from "effect"
import { Autonomy, DEFAULT_AUTONOMY } from "./Policy.ts"
import { PREVIEW_DEVICES, ZOOM_LEVELS } from "./Preview.ts"
import { ModelDefault } from "./Provider.ts"
import { ReasoningEffort } from "./Session.ts"

export const PinnedEffort = Schema.Union([ReasoningEffort, Schema.Literal("default")])
export type PinnedEffort = typeof PinnedEffort.Type

export const PinnedDefaults = Schema.Struct({
  autonomy: Schema.NullOr(Autonomy),
  effort: Schema.NullOr(PinnedEffort),
  model: Schema.NullOr(ModelDefault).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
})
export type PinnedDefaults = typeof PinnedDefaults.Type

export const NO_PINS: PinnedDefaults = { autonomy: null, effort: null, model: null }

export const newThreadAutonomy = (
  project: { readonly defaultAutonomy: Autonomy | null } | undefined,
  pinned: Pick<PinnedDefaults, "autonomy">,
): Autonomy => project?.defaultAutonomy ?? pinned.autonomy ?? DEFAULT_AUTONOMY

export const togglePin = <Key extends keyof PinnedDefaults>(
  pinned: PinnedDefaults,
  key: Key,
  value: NonNullable<PinnedDefaults[Key]>,
): PinnedDefaults => ({ ...pinned, [key]: pinned[key] === value ? null : value })

export const HistoryPreferences = Schema.Struct({
  importFromCli: Schema.Boolean,
})
export type HistoryPreferences = typeof HistoryPreferences.Type

export const DEFAULT_HISTORY_PREFERENCES: HistoryPreferences = { importFromCli: true }

export const ToolsPreferences = Schema.Struct({
  terminals: Schema.Boolean,
  openThread: Schema.Boolean,
  skills: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
})
export type ToolsPreferences = typeof ToolsPreferences.Type

export const DEFAULT_TOOLS_PREFERENCES: ToolsPreferences = {
  terminals: true,
  openThread: true,
  skills: true,
}

export const BrowserLinkTarget = Schema.Literals(["browser", "system"])
export type BrowserLinkTarget = typeof BrowserLinkTarget.Type

export const BrowserAppearance = Schema.Literals(["system", "light", "dark"])
export type BrowserAppearance = typeof BrowserAppearance.Type

export const FILL_DEVICE = "fill"

export const BrowserDevice = Schema.String.check(
  Schema.makeFilter(
    (id: string) => id === FILL_DEVICE || PREVIEW_DEVICES.some((device) => device.id === id),
  ),
)

export const BrowserZoom = Schema.Number.check(
  Schema.makeFilter((zoom: number) => ZOOM_LEVELS.some((level) => level === zoom)),
)

export const BrowserPreferences = Schema.Struct({
  linkTarget: BrowserLinkTarget,
  device: BrowserDevice.pipe(Schema.withDecodingDefaultKey(Effect.succeed(FILL_DEVICE))),
  zoom: BrowserZoom.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  appearance: BrowserAppearance.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<BrowserAppearance>("system")),
  ),
  offerLocalAddresses: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(true))),
})
export type BrowserPreferences = typeof BrowserPreferences.Type

export const DEFAULT_BROWSER_PREFERENCES: BrowserPreferences = {
  linkTarget: "browser",
  device: FILL_DEVICE,
  zoom: 1,
  appearance: "system",
  offerLocalAddresses: true,
}

const CliPath = Schema.NullOr(Schema.String).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed(null)),
)

export const CliPathPreferences = Schema.Struct({
  "claude-code": CliPath,
  codex: CliPath,
  kiro: CliPath,
  antigravity: CliPath,
})
export type CliPathPreferences = typeof CliPathPreferences.Type

export const DEFAULT_CLI_PATH_PREFERENCES: CliPathPreferences = {
  "claude-code": null,
  codex: null,
  kiro: null,
  antigravity: null,
}

export const HUMANITY_TOOL_TOKENS: Readonly<Record<keyof ToolsPreferences, number>> = {
  terminals: 1_400,
  openThread: 600,
  skills: 250,
}

export const HUMANITY_TOKENS_PER_SKILL = 60
