import { Schema } from "effect"

export const CheckpointChange = Schema.Struct({
  path: Schema.String,
  since: Schema.Literals(["added", "modified", "deleted"]),
})
export type CheckpointChange = typeof CheckpointChange.Type

export const RewindPreview = Schema.Struct({
  messageId: Schema.String,
  checkpoint: Schema.Boolean,
  changes: Schema.Array(CheckpointChange),
  changed: Schema.Number,
  removedMessages: Schema.Number,
  sharedCheckout: Schema.Boolean,
  busyTerminals: Schema.Number,
})
export type RewindPreview = typeof RewindPreview.Type

export const RewindUndo = Schema.Literals(["available", "done", "none"])
export type RewindUndo = typeof RewindUndo.Type

export const REWIND_PREVIEW_LIMIT = 200
