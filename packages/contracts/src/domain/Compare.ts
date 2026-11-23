import { Schema } from "effect"
import { WorkingTreeDiff } from "./Git.ts"
import { AgentProvider } from "./Provider.ts"
import { ReasoningEffort, Session } from "./Session.ts"
import { UsageAmount } from "./Usage.ts"

export const COMPARE_RUNS = { min: 2, max: 4 } as const

export const CompareRunRequest = Schema.Struct({
  provider: AgentProvider,
  model: Schema.optional(Schema.String),
  effort: Schema.optional(ReasoningEffort),
  accountId: Schema.optional(Schema.String),
})
export type CompareRunRequest = typeof CompareRunRequest.Type

export const CompareRun = Schema.Struct({
  session: Session,
  diff: Schema.NullOr(WorkingTreeDiff),
  amount: UsageAmount,
  lastMessage: Schema.NullOr(Schema.String),
})
export type CompareRun = typeof CompareRun.Type

export const GroupComparison = Schema.Struct({
  groupId: Schema.String,
  base: Schema.NullOr(Schema.String),
  runs: Schema.Array(CompareRun),
})
export type GroupComparison = typeof GroupComparison.Type
