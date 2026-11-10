import { assert, describe, it } from "@effect/vitest"
import type { MessageContent, SessionEvent, SessionStatus } from "@humanity/contracts"
import { Effect, Fiber, Layer, Ref, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { AgentRunnerFake, FakeAgentLog, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { Services } from "../src/Daemon.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { SessionService, sessionBranchName, slugify } from "../src/services/SessionService.ts"
import { baseLayer, git, tempDir, tempRepo } from "./helpers.ts"

/** A full set of services over `home`, with a scripted agent instead of the SDK. */
const services = (home: string, script: FakeScript) =>
  Services.pipe(Layer.provideMerge(AgentRunnerFake(script)), Layer.provideMerge(baseLayer(home)))

const waitForStatus = (sessionId: string, status: SessionStatus) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    for (let attempt = 0; attempt < 400; attempt++) {
      const session = yield* sessions.get(sessionId)
      if (session.status === status) return session
      yield* Effect.sleep("10 millis")
    }
    const session = yield* sessions.get(sessionId)
    return assert.fail(`session stayed ${session.status}, expected ${status}`)
  })

const contents = (sessionId: string) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const snapshot = yield* sessions.subscribe(sessionId).pipe(Stream.take(1), Stream.runCollect)
    const first = snapshot[0]
    if (first?._tag !== "Snapshot") return assert.fail("expected a snapshot first")
    return first
  })

const tags = (messages: ReadonlyArray<{ readonly content: MessageContent }>) =>
  messages.map((message) => message.content._tag)

const setup = (files?: Record<string, string>) =>
  Effect.gen(function* () {
    const home = yield* tempDir()
    const repo = yield* tempRepo(files)
    return { home, repo }
  })

const addProject = (repo: string) => ProjectService.use((projects) => projects.addLocal(repo))

describe("session naming", () => {
  it("slugifies titles into branch-safe names", () => {
    assert.strictEqual(slugify("Fix the login bug!"), "fix-the-login-bug")
    assert.strictEqual(slugify("  Ünïcode — and ÇAPS  "), "unicode-and-caps")
    assert.strictEqual(slugify("???"), "session")
    assert.isAtMost(slugify("a".repeat(100)).length, 40)
    assert.strictEqual(
      sessionBranchName("1234abcd-ffff-4000-8000-000000000000", "Add tests"),
      "humanity/1234abcd-add-tests",
    )
  })
})

describe("SessionService", () => {
  it.live("creates a session on its own branch and worktree, leaving the repo alone", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, title: "Fix login" })

        assert.match(session.branch, /^humanity\/[0-9a-f]{8}-fix-login$/)
        assert.strictEqual(session.worktreePath, join(home, "worktrees", project.id, session.id))
        assert.strictEqual(session.status, "idle")
        assert.isTrue(existsSync(join(session.worktreePath, "README.md")))
        assert.strictEqual(
          git(session.worktreePath, "branch", "--show-current").trim(),
          session.branch,
        )
        // The user's working copy stays on its branch.
        assert.strictEqual(git(repo, "branch", "--show-current").trim(), "main")

        assert.deepStrictEqual(
          (yield* sessions.list(project.id)).map((s) => s.id),
          [session.id],
        )
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("chats with the agent, records the transcript and stores the SDK session id", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({
          projectId: project.id,
          prompt: "What does this repo do?",
        })
        assert.strictEqual(session.title, "What does this repo do?")

        const idle = yield* waitForStatus(session.id, "idle")
        assert.strictEqual(idle.sdkSessionId, "fake-sdk-session-1")

        const snapshot = yield* contents(session.id)
        assert.deepStrictEqual(tags(snapshot.messages), [
          "user",
          "system_init",
          "assistant",
          "result",
        ])
        const reply = snapshot.messages[2]?.content
        assert.deepStrictEqual(reply, {
          _tag: "assistant",
          blocks: [{ _tag: "text", text: "It is a **fixture** repository." }],
          parentToolUseId: null,
        })
      }).pipe(Effect.provide(services(home, () => [{ text: "It is a **fixture** repository." }])))
    }),
  )

  it.live("runs only auto tools and denies everything else with an explanation", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "app.ts": "export const a = 1\n" })

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "go" })
        yield* waitForStatus(session.id, "idle")

        const snapshot = yield* contents(session.id)
        assert.deepStrictEqual(
          snapshot.toolCalls.map((call) => [call.toolName, call.status]),
          [
            ["Read", "succeeded"],
            ["Bash", "denied"],
            ["Edit", "denied"],
          ],
        )
        const denial = snapshot.toolCalls[2]?.output
        assert.isTrue(denial?.isError)
        assert.match(denial?.content ?? "", /Humanity denied Edit/)

        // Read never asked; Bash and Edit both went through canUseTool.
        const asked = (yield* Ref.get(log.permissions)).map((entry) => entry.toolName)
        assert.deepStrictEqual(asked, ["Bash", "Edit"])
        // Nothing reached disk.
        assert.strictEqual(
          readFileSync(join(session.worktreePath, "app.ts"), "utf8"),
          "export const a = 1\n",
        )
        // The project's auto tools are the ones pre-approved for the SDK.
        const [run] = yield* Ref.get(log.runs)
        assert.includeMembers([...(run?.allowedTools ?? [])], ["Read", "Glob", "Grep"])
        assert.notInclude([...(run?.allowedTools ?? [])], "Edit")
        assert.strictEqual(run?.cwd, session.worktreePath)
      }).pipe(
        Effect.provide(
          services(home, () => [
            { tool: "Read", input: { file_path: "app.ts" }, output: "export const a = 1" },
            { tool: "Bash", input: { command: "rm -rf /" } },
            {
              tool: "Edit",
              input: { file_path: "app.ts", old_string: "a = 1", new_string: "a = 2" },
            },
            { text: "I could not change the file." },
          ]),
        ),
      )
    }),
  )

  it.live("streams a snapshot first, then live events", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id })

        const collected = yield* sessions.subscribe(session.id).pipe(
          Stream.takeUntil(
            (event: SessionEvent) =>
              event._tag === "SessionStatusChanged" && event.status === "idle",
          ),
          Stream.runCollect,
          Effect.forkChild,
        )
        yield* Effect.sleep("50 millis")
        yield* sessions.sendMessage(session.id, "hello")
        const events = yield* Fiber.join(collected)

        const kinds = events.map((event) => event._tag)
        assert.strictEqual(kinds[0], "Snapshot")
        assert.includeMembers(kinds, [
          "AgentMessage",
          "TextDelta",
          "ToolCallStarted",
          "ToolCallFinished",
          "SkillLoaded",
          "SessionStatusChanged",
        ])
        const skill = events.find((event) => event._tag === "SkillLoaded")
        assert.strictEqual(skill?._tag === "SkillLoaded" ? skill.skill : "", "review")
      }).pipe(
        Effect.provide(
          services(home, () => [{ tool: "Skill", input: { skill: "review" } }, { text: "Hi!" }]),
        ),
      )
    }),
  )

  it.live("resumes the SDK session after a daemon restart", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = (prompt) => [{ text: `echo: ${prompt}` }]

      const sessionId = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "first" })
        yield* waitForStatus(session.id, "idle")
        return session.id
      }).pipe(Effect.provide(services(home, script)))

      // A brand new daemon over the same data directory.
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog

        const before = yield* contents(sessionId)
        assert.deepStrictEqual(tags(before.messages), [
          "user",
          "system_init",
          "assistant",
          "result",
        ])

        yield* sessions.sendMessage(sessionId, "second")
        yield* waitForStatus(sessionId, "idle")

        const [run] = yield* Ref.get(log.runs)
        assert.strictEqual(run?.resume, "fake-sdk-session-1")
        const after = yield* contents(sessionId)
        assert.strictEqual(after.messages.filter((m) => m.content._tag === "user").length, 2)
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("marks sessions that were running during a restart as interrupted", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      const sessionId = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "long task" })
        yield* waitForStatus(session.id, "running")
        return session.id
      }).pipe(Effect.provide(services(home, () => [{ hang: true }])))

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        assert.strictEqual((yield* sessions.get(sessionId)).status, "interrupted")
        const snapshot = yield* contents(sessionId)
        assert.strictEqual(snapshot.messages.at(-1)?.content._tag, "notice")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("interrupts a running turn and accepts the next message", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "start" })
        yield* waitForStatus(session.id, "running")

        yield* sessions.interrupt(session.id)
        yield* waitForStatus(session.id, "interrupted")
        // The status flips at once; the agent's closing result follows.
        let result: MessageContent | undefined
        for (let attempt = 0; attempt < 200 && result?._tag !== "result"; attempt++) {
          yield* Effect.sleep("10 millis")
          result = (yield* contents(session.id)).messages.at(-1)?.content
        }
        assert.strictEqual(
          result?._tag === "result" ? result.subtype : "",
          "error_during_execution",
        )

        yield* sessions.sendMessage(session.id, "again")
        yield* waitForStatus(session.id, "idle")
      }).pipe(
        Effect.provide(
          services(home, (_prompt, turn) => (turn === 1 ? [{ hang: true }] : [{ text: "done" }])),
        ),
      )
    }),
  )

  it.live("ends a session, optionally removing its worktree but keeping the branch", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, title: "Temp" })

        const ended = yield* sessions.end(session.id, { removeWorktree: true })
        assert.strictEqual(ended.status, "ended")
        assert.isFalse(existsSync(session.worktreePath))
        assert.include(git(repo, "branch", "--list", session.branch), session.branch)

        const error = yield* Effect.flip(sessions.sendMessage(session.id, "still there?"))
        assert.strictEqual(error._tag, "SessionEnded")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("removing a project removes its session worktrees but never the repo", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const projects = yield* ProjectService
        const sql = yield* SqlClient.SqlClient
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id })

        yield* sessions.stopProject(project.id)
        yield* projects.remove(project.id)

        assert.isFalse(existsSync(session.worktreePath))
        assert.isTrue(existsSync(join(repo, "README.md")))
        const rows = yield* sql`SELECT id FROM sessions`
        assert.strictEqual(rows.length, 0)
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("reports unknown sessions with a tagged error", () =>
    Effect.gen(function* () {
      const { home } = yield* setup()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const error = yield* Effect.flip(sessions.sendMessage("nope", "hi"))
        assert.strictEqual(error._tag, "SessionNotFound")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )
})
