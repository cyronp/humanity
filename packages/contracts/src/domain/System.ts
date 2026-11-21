import { Schema } from "effect"

export const SystemInfo = Schema.Struct({
  dataDir: Schema.String,
  recordingsDir: Schema.String,
  port: Schema.Number,
  platform: Schema.String,
  arch: Schema.String,
  osRelease: Schema.String,
  nodeVersion: Schema.String,
  electronVersion: Schema.NullOr(Schema.String),
})
export type SystemInfo = typeof SystemInfo.Type

export const SystemFolder = Schema.Literals(["data", "recordings"])
export type SystemFolder = typeof SystemFolder.Type

export const RecordingsUsage = Schema.Struct({
  files: Schema.Number,
  bytes: Schema.Number,
})
export type RecordingsUsage = typeof RecordingsUsage.Type
