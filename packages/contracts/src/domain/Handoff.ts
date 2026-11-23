import { Schema } from "effect"

export const HandoffEntryKind = Schema.Literals(["human", "agent", "event"])
export type HandoffEntryKind = typeof HandoffEntryKind.Type

export const HandoffEntryState = Schema.Literals(["included", "omitted", "cut"])
export type HandoffEntryState = typeof HandoffEntryState.Type

export const HandoffPreviewEntry = Schema.Struct({
  index: Schema.Number,
  kind: HandoffEntryKind,
  text: Schema.String,
  state: HandoffEntryState,
})
export type HandoffPreviewEntry = typeof HandoffPreviewEntry.Type

export const HandoffPreview = Schema.Struct({
  text: Schema.String,
  tokens: Schema.Number,
  included: Schema.Number,
  omitted: Schema.Number,
  cut: Schema.Number,
  editable: Schema.Boolean,
  entries: Schema.Array(HandoffPreviewEntry),
})
export type HandoffPreview = typeof HandoffPreview.Type
