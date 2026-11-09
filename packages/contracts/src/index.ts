import { Schema } from "effect"

export const HunkStatus = Schema.Literals(["pending", "approved", "rejected"])
export type HunkStatus = typeof HunkStatus.Type
