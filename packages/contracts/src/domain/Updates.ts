import { Schema } from "effect"

/** Which releases the desktop app updates to: tagged ones, or the build of `main` made every night. */
export const UpdateTrack = Schema.Literals(["stable", "nightly"])
export type UpdateTrack = typeof UpdateTrack.Type

export const UpdatePreferences = Schema.Struct({
  /** Look for a new version when the app opens; after that, only when the human asks. Installing always waits for the human. */
  autoCheck: Schema.Boolean,
  track: UpdateTrack,
})
export type UpdatePreferences = typeof UpdatePreferences.Type

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = { autoCheck: true, track: "stable" }

/** Where the desktop app's updates stand. Times are ISO strings. */
export const UpdateState = Schema.Union([
  /** Nothing here can install an update, like a browser tab or a development build. */
  Schema.TaggedStruct("Unsupported", { reason: Schema.String }),
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Checking", {}),
  Schema.TaggedStruct("UpToDate", { checkedAt: Schema.String }),
  Schema.TaggedStruct("Available", { version: Schema.String, checkedAt: Schema.String }),
  Schema.TaggedStruct("Downloading", { version: Schema.String, percent: Schema.Number }),
  /** The app is closing to run the installer; it starts again on the new version. */
  Schema.TaggedStruct("Installing", { version: Schema.String }),
  Schema.TaggedStruct("Failed", { message: Schema.String }),
])
export type UpdateState = typeof UpdateState.Type

export const UpdateStatus = Schema.Struct({
  /** The running desktop app's version; `null` while none is connected. */
  currentVersion: Schema.NullOr(Schema.String),
  preferences: UpdatePreferences,
  state: UpdateState,
})
export type UpdateStatus = typeof UpdateStatus.Type

/** What the daemon asks of the desktop app that installs updates. */
export const DesktopUpdateCommand = Schema.Union([
  /** Sent first, then again whenever the human changes the preferences. */
  Schema.TaggedStruct("Configure", { preferences: UpdatePreferences }),
  Schema.TaggedStruct("Check", {}),
  /** Download the newest version of the track and restart into it. */
  Schema.TaggedStruct("Install", {}),
])
export type DesktopUpdateCommand = typeof DesktopUpdateCommand.Type
