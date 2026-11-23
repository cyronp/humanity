import {
  AgentProvider,
  type PlanUsage,
  PlanWindowName,
  ProjectId,
  SessionId,
  type UsageAmount,
  type UsageReport,
  type UsageSummary,
  USAGE_TOP,
} from "@humanity/contracts"
import { Context, Effect, Layer, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export interface TurnUsage {
  readonly id: string
  readonly sessionId: string
  readonly projectId: string
  readonly provider: AgentProvider
  readonly accountId: string | null
  readonly model: string | null
  readonly usage: UsageSummary
  readonly costUsd: number | null
  readonly durationMs: number
  readonly endedAt: string
}

const AMOUNT_COLUMNS = `
  COUNT(*) AS turns,
  COALESCE(SUM(input_tokens), 0) AS input_tokens,
  COALESCE(SUM(output_tokens), 0) AS output_tokens,
  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
  COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
  SUM(cost_usd) AS cost_usd
`

const AmountFields = {
  turns: Schema.Number,
  input_tokens: Schema.Number,
  output_tokens: Schema.Number,
  cache_read_tokens: Schema.Number,
  cache_creation_tokens: Schema.Number,
  cost_usd: Schema.NullOr(Schema.Number),
}

const toAmount = (row: {
  readonly turns: number
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_read_tokens: number
  readonly cache_creation_tokens: number
  readonly cost_usd: number | null
}): UsageAmount => ({
  turns: row.turns,
  inputTokens: row.input_tokens,
  outputTokens: row.output_tokens,
  cacheReadTokens: row.cache_read_tokens,
  cacheCreationTokens: row.cache_creation_tokens,
  costUsd: row.cost_usd,
})

const TOKENS = "input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens"

const Range = Schema.Struct({ from: Schema.String, to: Schema.String, offset: Schema.String })

export class UsageRepo extends Context.Service<
  UsageRepo,
  {
    readonly recordTurn: (turn: TurnUsage) => Effect.Effect<void>
    readonly recordPlan: (
      provider: AgentProvider,
      accountId: string | null,
      plan: PlanUsage,
      sampledAt: string,
    ) => Effect.Effect<void>
    readonly report: (options: {
      readonly from: string
      readonly to: string
      readonly utcOffsetMinutes: number
    }) => Effect.Effect<UsageReport>
  }
>()("humanity/UsageRepo") {
  static readonly layer = Layer.effect(
    UsageRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const recordTurn = (turn: TurnUsage) =>
        sql`
          INSERT INTO turn_usage ${sql.insert({
            id: turn.id,
            session_id: turn.sessionId,
            project_id: turn.projectId,
            provider: turn.provider,
            account_key: turn.accountId ?? "",
            model: turn.model,
            input_tokens: turn.usage.inputTokens,
            output_tokens: turn.usage.outputTokens,
            cache_read_tokens: turn.usage.cacheReadTokens,
            cache_creation_tokens: turn.usage.cacheCreationTokens,
            cost_usd: turn.costUsd,
            duration_ms: turn.durationMs,
            estimated: 0,
            ended_at: turn.endedAt,
          })}
          ON CONFLICT (id) DO NOTHING
        `.pipe(Effect.asVoid, Effect.orDie)

      const recordPlan = (
        provider: AgentProvider,
        accountId: string | null,
        plan: PlanUsage,
        sampledAt: string,
      ) =>
        Effect.forEach(
          [
            ["five_hour", plan.fiveHour],
            ["seven_day", plan.sevenDay],
          ] as const,
          ([window, value]) =>
            value === null
              ? Effect.void
              : sql`
                  INSERT INTO plan_usage_samples ${sql.insert({
                    provider,
                    account_key: accountId ?? "",
                    window,
                    utilization: value.utilization,
                    resets_at: value.resetsAt,
                    sampled_at: sampledAt,
                  })}
                `.pipe(Effect.asVoid),
          { discard: true },
        ).pipe(Effect.orDie)

      const byDay = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct({ day: Schema.String, provider: AgentProvider, ...AmountFields }),
        execute: ({ from, to, offset }) =>
          sql.unsafe(
            `SELECT date(ended_at, ?) AS day, provider, ${AMOUNT_COLUMNS} FROM turn_usage WHERE ended_at >= ? AND ended_at < ? GROUP BY day, provider ORDER BY day, provider`,
            [offset, from, to],
          ),
      })
      const byProvider = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct({ provider: AgentProvider, ...AmountFields }),
        execute: ({ from, to }) =>
          sql.unsafe(
            `SELECT provider, ${AMOUNT_COLUMNS} FROM turn_usage WHERE ended_at >= ? AND ended_at < ? GROUP BY provider ORDER BY SUM(${TOKENS}) DESC`,
            [from, to],
          ),
      })
      const byModel = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct({
          provider: AgentProvider,
          model: Schema.NullOr(Schema.String),
          ...AmountFields,
        }),
        execute: ({ from, to }) =>
          sql.unsafe(
            `SELECT provider, model, ${AMOUNT_COLUMNS} FROM turn_usage WHERE ended_at >= ? AND ended_at < ? GROUP BY provider, model ORDER BY SUM(${TOKENS}) DESC LIMIT ${USAGE_TOP}`,
            [from, to],
          ),
      })
      const byProject = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct({ project_id: ProjectId, ...AmountFields }),
        execute: ({ from, to }) =>
          sql.unsafe(
            `SELECT project_id, ${AMOUNT_COLUMNS} FROM turn_usage WHERE ended_at >= ? AND ended_at < ? GROUP BY project_id ORDER BY SUM(${TOKENS}) DESC LIMIT ${USAGE_TOP}`,
            [from, to],
          ),
      })
      const bySession = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct({ session_id: SessionId, project_id: ProjectId, ...AmountFields }),
        execute: ({ from, to }) =>
          sql.unsafe(
            `SELECT session_id, project_id, ${AMOUNT_COLUMNS} FROM turn_usage WHERE ended_at >= ? AND ended_at < ? GROUP BY session_id, project_id ORDER BY SUM(${TOKENS}) DESC LIMIT ${USAGE_TOP}`,
            [from, to],
          ),
      })
      const totals = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct(AmountFields),
        execute: ({ from, to }) =>
          sql.unsafe(
            `SELECT ${AMOUNT_COLUMNS} FROM turn_usage WHERE ended_at >= ? AND ended_at < ?`,
            [from, to],
          ),
      })
      const planSamples = SqlSchema.findAll({
        Request: Range,
        Result: Schema.Struct({
          provider: AgentProvider,
          account_key: Schema.String,
          window: PlanWindowName,
          utilization: Schema.Number,
          resets_at: Schema.NullOr(Schema.String),
          sampled_at: Schema.String,
        }),
        execute: ({ from, to }) =>
          sql`SELECT * FROM plan_usage_samples WHERE sampled_at >= ${from} AND sampled_at < ${to} ORDER BY sampled_at`,
      })

      const offsetOf = (minutes: number) => {
        const rounded = Math.round(Number.isFinite(minutes) ? minutes : 0)
        return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded)} minutes`
      }

      const report = (options: {
        readonly from: string
        readonly to: string
        readonly utcOffsetMinutes: number
      }) =>
        Effect.gen(function* () {
          const range = {
            from: options.from,
            to: options.to,
            offset: offsetOf(options.utcOffsetMinutes),
          }
          const [total] = yield* totals(range)
          return {
            from: options.from,
            to: options.to,
            totals:
              total === undefined
                ? {
                    turns: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheReadTokens: 0,
                    cacheCreationTokens: 0,
                    costUsd: null,
                  }
                : toAmount(total),
            byDay: (yield* byDay(range)).map((row) => ({
              day: row.day,
              provider: row.provider,
              amount: toAmount(row),
            })),
            byProvider: (yield* byProvider(range)).map((row) => ({
              provider: row.provider,
              amount: toAmount(row),
            })),
            byModel: (yield* byModel(range)).map((row) => ({
              provider: row.provider,
              model: row.model,
              amount: toAmount(row),
            })),
            byProject: (yield* byProject(range)).map((row) => ({
              projectId: row.project_id,
              amount: toAmount(row),
            })),
            bySession: (yield* bySession(range)).map((row) => ({
              sessionId: row.session_id,
              projectId: row.project_id,
              amount: toAmount(row),
            })),
            plan: (yield* planSamples(range)).map((row) => ({
              provider: row.provider,
              accountKey: row.account_key,
              window: row.window,
              utilization: row.utilization,
              resetsAt: row.resets_at,
              sampledAt: row.sampled_at,
            })),
          } satisfies UsageReport
        }).pipe(Effect.orDie)

      return UsageRepo.of({ recordTurn, recordPlan, report })
    }),
  )
}
