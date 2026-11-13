import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { FakeAgentLog } from "../src/agent/AgentRunnerFake.ts"
import type { TestConversation } from "../src/claude/ClaudeHistory.ts"
import { HistoryImport } from "../src/services/HistoryImport.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { addProject, contents, services, setup, tags, waitForStatus } from "./sessionHelpers.ts"

const conversation = (
  sessionId: string,
  lastModified: number,
  prompts: ReadonlyArray<string>,
): TestConversation => ({
  sessionId,
  title: `Conversation ${sessionId}`,
  gitBranch: "feature",
  createdAt: Date.UTC(2026, 10, 1),
  lastModified,
  entries: prompts.flatMap((prompt, index) => [
    {
      type: "user",
      message: { role: "user", content: prompt },
      timestamp: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
    },
    {
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: `Answer to ${prompt}` }] },
      timestamp: new Date(Date.UTC(2026, 10, 1, 0, index, 30)).toISOString(),
    },
  ]),
})

describe("HistoryImport", () => {
  it.live("imports the project's Claude Code conversations into its history, once", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const history = {
        [repo]: [
          conversation("cli-1", Date.UTC(2026, 10, 2), ["Fix the login bug"]),
          // Only `/clear`: not a conversation.
          {
            ...conversation("cli-2", Date.UTC(2026, 10, 3), []),
            entries: [
              {
                type: "user",
                isCompletedLocalCommand: true,
                message: { role: "user", content: "<command-name>/clear</command-name>" },
              },
            ],
          },
        ],
      }

      yield* Effect.gen(function* () {
        const imports = yield* HistoryImport
        const sessions = yield* SessionService
        const project = yield* addProject(repo)

        assert.strictEqual(yield* imports.syncProject(project.id), 1)
        assert.strictEqual(yield* imports.syncProject(project.id), 0)

        const [thread, ...others] = yield* sessions.list(project.id)
        assert.strictEqual(others.length, 0)
        assert.strictEqual(thread?.origin, "claude-code")
        assert.strictEqual(thread?.status, "ended")
        assert.strictEqual(thread?.sdkSessionId, "cli-1")
        assert.strictEqual(thread?.title, "Conversation cli-1")
        assert.strictEqual(thread?.branch, "feature")
        assert.strictEqual(thread?.worktreePath, project.localPath)
        assert.strictEqual(thread?.updatedAt, new Date(Date.UTC(2026, 10, 2)).toISOString())

        const snapshot = yield* contents(thread?.id ?? "")
        assert.deepStrictEqual(tags(snapshot.messages), ["user", "assistant"])
      }).pipe(
        Effect.provide(
          services(
            home,
            () => [],
            () => history,
          ),
        ),
      )
    }),
  )

  it.live("refreshes a thread while its transcript changes, until it is continued here", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      let history = { [repo]: [conversation("cli-1", 1000, ["one"])] }

      yield* Effect.gen(function* () {
        const imports = yield* HistoryImport
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        yield* imports.syncProject(project.id)
        const [thread] = yield* sessions.list(project.id)
        const id = thread?.id ?? ""

        // More was said in the CLI.
        history = { [repo]: [conversation("cli-1", 2000, ["one", "two"])] }
        assert.strictEqual(yield* imports.syncProject(project.id), 1)
        assert.deepStrictEqual(tags((yield* contents(id)).messages), [
          "user",
          "assistant",
          "user",
          "assistant",
        ])
        assert.strictEqual((yield* sessions.list(project.id)).length, 1)

        // Continued in Humanity: the conversation resumes where the CLI left it.
        yield* sessions.sendMessage(id, "three")
        yield* waitForStatus(id, "idle")
        const runs = yield* Ref.get(log.runs)
        assert.strictEqual(runs[0]?.resume, "cli-1")
        assert.strictEqual(runs[0]?.cwd, project.localPath)
        const continued = yield* contents(id)
        assert.deepStrictEqual(tags(continued.messages).slice(4, 6), ["notice", "user"])

        // The CLI's transcript no longer replaces what happened here.
        history = { [repo]: [conversation("cli-1", 3000, ["one", "two", "elsewhere"])] }
        assert.strictEqual(yield* imports.syncProject(project.id), 0)
        assert.deepStrictEqual(tags((yield* contents(id)).messages), tags(continued.messages))
      }).pipe(
        Effect.provide(
          services(
            home,
            () => [{ text: "ok" }],
            () => history,
          ),
        ),
      )
    }),
  )

  it.live("leaves out conversations Humanity itself started", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const history: Record<string, ReadonlyArray<TestConversation>> = {}

      yield* Effect.gen(function* () {
        const imports = yield* HistoryImport
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const own = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        const ran = yield* waitForStatus(own.id, "idle")
        history[repo] = [conversation(ran.sdkSessionId ?? "", Date.now(), ["hello"])]

        assert.strictEqual(yield* imports.syncProject(project.id), 0)
        assert.strictEqual((yield* sessions.list(project.id)).length, 1)
      }).pipe(
        Effect.provide(
          services(
            home,
            () => [{ text: "hi" }],
            () => history,
          ),
        ),
      )
    }),
  )

  it.live("keeps ended threads of Humanity's own closed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const own = yield* sessions.create({ projectId: project.id })
        yield* sessions.end(own.id, { removeWorktree: false })
        const refused = yield* Effect.flip(sessions.sendMessage(own.id, "again"))
        assert.strictEqual(refused._tag, "SessionEnded")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )
})
