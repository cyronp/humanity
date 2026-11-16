import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { FakeAgentLog } from "../src/agent/AgentRunnerFake.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { addProject, eventually, services, setup } from "./sessionHelpers.ts"

const PDF = Buffer.from("%PDF-1.7\n%fake\n")

describe("threads on Codex", () => {
  it.live(
    "a thread runs on Claude Code unless it is started on Codex, and keeps its provider",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()
        yield* Effect.gen(function* () {
          const sessions = yield* SessionService
          const log = yield* FakeAgentLog
          const project = yield* addProject(repo)

          const claude = yield* sessions.create({ projectId: project.id, title: "On Claude" })
          assert.strictEqual(claude.provider, "claude-code")

          const codex = yield* sessions.create({
            projectId: project.id,
            provider: "codex",
            model: "gpt-test",
            prompt: "Fix the bug",
          })
          assert.strictEqual(codex.provider, "codex")
          assert.strictEqual((yield* sessions.get(codex.id)).provider, "codex")

          const run = yield* eventually(
            "the agent to start",
            Effect.map(Ref.get(log.runs), (runs) => runs[0]),
          )
          assert.strictEqual(run.provider, "codex")
          assert.strictEqual(run.model, "gpt-test")
          assert.strictEqual(run.cwd, repo)
        }).pipe(Effect.provide(services(home, () => [{ hang: true }])))
      }).pipe(Effect.scoped),
  )

  it.live("refuses a PDF, which Codex cannot read, before anything is stored or sent", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const attachments = [{ name: "spec.pdf", data: PDF.toString("base64") }]

        const refused = yield* Effect.flip(
          sessions.create({
            projectId: project.id,
            provider: "codex",
            prompt: "Read this",
            attachments,
          }),
        )
        assert.strictEqual(refused._tag, "AttachmentRejected")
        assert.strictEqual((yield* sessions.list(project.id)).length, 0)

        const session = yield* sessions.create({ projectId: project.id, provider: "codex" })
        const again = yield* Effect.flip(sessions.sendMessage(session.id, "Read this", attachments))
        assert.strictEqual(again._tag, "AttachmentRejected")
        assert.strictEqual((yield* Ref.get(log.runs)).length, 0)
      }).pipe(Effect.provide(services(home, () => [])))
    }).pipe(Effect.scoped),
  )
})
