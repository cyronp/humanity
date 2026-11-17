import { Schema } from "effect"

export const UpdateTrack = Schema.Literals(["stable", "nightly"])
export type UpdateTrack = typeof UpdateTrack.Type

export const UpdatePreferences = Schema.Struct({
  autoCheck: Schema.Boolean,
  track: UpdateTrack,
})
export type UpdatePreferences = typeof UpdatePreferences.Type

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = { autoCheck: true, track: "stable" }

export const UpdateState = Schema.Union([
  Schema.TaggedStruct("Unsupported", { reason: Schema.String }),
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Checking", {}),
  Schema.TaggedStruct("UpToDate", { checkedAt: Schema.String }),
  Schema.TaggedStruct("Available", { version: Schema.String, checkedAt: Schema.String }),
  Schema.TaggedStruct("Downloading", { version: Schema.String, percent: Schema.Number }),
  Schema.TaggedStruct("Installing", { version: Schema.String }),
  Schema.TaggedStruct("Failed", { message: Schema.String }),
])
export type UpdateState = typeof UpdateState.Type

export const UpdateStatus = Schema.Struct({
  currentVersion: Schema.NullOr(Schema.String),
  preferences: UpdatePreferences,
  state: UpdateState,
})
export type UpdateStatus = typeof UpdateStatus.Type

export const DesktopUpdateCommand = Schema.Union([
  Schema.TaggedStruct("Configure", { preferences: UpdatePreferences }),
  Schema.TaggedStruct("Check", {}),
  Schema.TaggedStruct("Install", {}),
])
export type DesktopUpdateCommand = typeof DesktopUpdateCommand.Type
