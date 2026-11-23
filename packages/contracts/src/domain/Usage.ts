import { Schema } from "effect"
import { ProjectId } from "./Project.ts"
import { AgentProvider } from "./Provider.ts"
import { SessionId } from "./Session.ts"

export const UsageAmount = Schema.Struct({
  turns: Schema.Number,
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  cacheReadTokens: Schema.Number,
  cacheCreationTokens: Schema.Number,
  costUsd: Schema.NullOr(Schema.Number),
})
export type UsageAmount = typeof UsageAmount.Type

export const PlanWindowName = Schema.Literals(["five_hour", "seven_day"])
export type PlanWindowName = typeof PlanWindowName.Type

export const UsageReport = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  totals: UsageAmount,
  byDay: Schema.Array(
    Schema.Struct({ day: Schema.String, provider: AgentProvider, amount: UsageAmount }),
  ),
  byProvider: Schema.Array(Schema.Struct({ provider: AgentProvider, amount: UsageAmount })),
  byModel: Schema.Array(
    Schema.Struct({
      provider: AgentProvider,
      model: Schema.NullOr(Schema.String),
      amount: UsageAmount,
    }),
  ),
  byProject: Schema.Array(Schema.Struct({ projectId: ProjectId, amount: UsageAmount })),
  bySession: Schema.Array(
    Schema.Struct({ sessionId: SessionId, projectId: ProjectId, amount: UsageAmount }),
  ),
  plan: Schema.Array(
    Schema.Struct({
      provider: AgentProvider,
      accountKey: Schema.String,
      window: PlanWindowName,
      utilization: Schema.Number,
      resetsAt: Schema.NullOr(Schema.String),
      sampledAt: Schema.String,
    }),
  ),
})
export type UsageReport = typeof UsageReport.Type

export const totalTokens = (amount: UsageAmount): number =>
  amount.inputTokens + amount.outputTokens + amount.cacheReadTokens + amount.cacheCreationTokens

export const USAGE_TOP = 10
