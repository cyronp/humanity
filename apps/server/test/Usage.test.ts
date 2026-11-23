import { assert, describe, it } from "@effect/vitest"
import { totalTokens } from "@humanity/contracts"
import { Effect } from "effect"
import { SessionService } from "../src/services/SessionService.ts"
import { addProject, services, setup, waitForStatus } from "./sessionHelpers.ts"

const DAY = 86_400_000

describe("usage report", () => {
  it.live("records each turn and adds them up by day, provider, model, project and thread", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")
        yield* sessions.sendMessage(session.id, "again")
        yield* waitForStatus(session.id, "idle")
        const refreshed = yield* sessions.refreshUsage(session.id)

        const now = Date.now()
        const report = yield* sessions.usageReport({
          from: new Date(now - DAY).toISOString(),
          to: new Date(now + DAY).toISOString(),
          utcOffsetMinutes: 0,
        })
        assert.strictEqual(report.totals.turns, 2)
        assert.strictEqual(report.totals.costUsd, 0)
        assert.deepStrictEqual(
          report.byProvider.map((row) => [row.provider, row.amount.turns]),
          [["claude-code", 2]],
        )
        assert.deepStrictEqual(
          report.byProject.map((row) => row.projectId),
          [project.id],
        )
        assert.deepStrictEqual(
          report.bySession.map((row) => row.sessionId),
          [session.id],
        )
        assert.lengthOf(report.byDay, 1)
        assert.strictEqual(report.byDay[0]?.day, new Date(now).toISOString().slice(0, 10))
        assert.strictEqual(totalTokens(report.totals), totalTokens(report.byProvider[0]!.amount))
        if (refreshed.plan?.fiveHour != null) {
          assert.isAbove(report.plan.length, 0)
          assert.strictEqual(report.plan[0]?.window, "five_hour")
        }

        const before = yield* sessions.usageReport({
          from: new Date(now - 3 * DAY).toISOString(),
          to: new Date(now - 2 * DAY).toISOString(),
          utcOffsetMinutes: 0,
        })
        assert.strictEqual(before.totals.turns, 0)
        assert.isNull(before.totals.costUsd)
        assert.deepStrictEqual(before.byDay, [])
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )
})

describe("compare runs", () => {
  it.live("starts every run in a worktree of its own from one commit, and compares them", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "a.txt": "start\n" })

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const refused = yield* Effect.flip(
          sessions.createGroup({
            projectId: project.id,
            prompt: "fix it",
            runs: [{ provider: "claude-code" }],
          }),
        )
        assert.strictEqual(refused._tag, "CompareUnavailable")

        const runs = yield* sessions.createGroup({
          projectId: project.id,
          prompt: "fix it",
          runs: [{ provider: "claude-code", model: "opus" }, { provider: "claude-code" }],
        })
        assert.lengthOf(runs, 2)
        const [first, second] = runs
        assert.isTrue(first!.inWorktree && second!.inWorktree)
        assert.notStrictEqual(first!.worktreePath, second!.worktreePath)
        assert.strictEqual(first!.groupId, second!.groupId)
        assert.include(first!.title, "opus")
        yield* waitForStatus(first!.id, "idle")
        yield* waitForStatus(second!.id, "idle")

        const comparison = yield* sessions.compareGroup(first!.groupId!)
        assert.lengthOf(comparison.runs, 2)
        assert.isNotNull(comparison.base)
        const written = comparison.runs.map((run) => run.diff?.files.map((file) => file.filePath))
        assert.deepStrictEqual(written, [["a.txt"], ["a.txt"]])
        assert.strictEqual(comparison.runs[0]?.lastMessage, "done")
        assert.strictEqual(comparison.runs[0]?.amount.turns, 1)

        const missing = yield* Effect.flip(sessions.compareGroup("nope"))
        assert.strictEqual(missing._tag, "CompareUnavailable")
      }).pipe(
        Effect.provide(
          services(home, () => [
            { tool: "Write", input: { file_path: "a.txt", content: "changed\n" } },
            { text: "done" },
          ]),
        ),
      )
    }),
  )
})
