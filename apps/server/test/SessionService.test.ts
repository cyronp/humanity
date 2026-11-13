import { assert, describe, it } from "@effect/vitest"
import {
  type MessageContent,
  OPEN_THREAD_TOOL,
  threadHref,
  type PlanUsage,
  type SessionEvent,
  setToolRule,
} from "@humanity/contracts"
import { Effect, Fiber, Ref, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { FakeAgentLog, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { ClaudeProbeFailed } from "../src/claude/ClaudeCode.ts"
import { ClaudeAccountService } from "../src/services/ClaudeAccountService.ts"
import { ExtensionsService } from "../src/services/ExtensionsService.ts"
import openThreadPolicy from "../src/db/migrations/0012_open_thread_policy.ts"
import { PolicyService } from "../src/services/PolicyService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import {
  matchModel,
  SessionService,
  sessionBranchName,
  slugify,
} from "../src/services/SessionService.ts"
import { git } from "./helpers.ts"
import {
  addProject,
  contents,
  eventually,
  services,
  setup,
  tags,
  waitForStatus,
} from "./sessionHelpers.ts"

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

describe("matchModel", () => {
  const model = (value: string, displayName: string) => ({ value, displayName, description: "" })
  const models = [
    model("default", "Default (recommended)"),
    model("opus", "Opus 5.5"),
    model("haiku", "Haiku 5.5"),
    model("claude-haiku-4-5-20251001", "Haiku 4.5"),
    model("claude-opus-5", "Opus 5"),
  ]

  it("takes a value as Claude Code lists it", () => {
    assert.strictEqual(matchModel(models, "haiku"), "haiku")
    assert.strictEqual(matchModel(models, " Opus "), "opus")
    assert.strictEqual(matchModel(models, "claude-opus-5"), "claude-opus-5")
    assert.strictEqual(matchModel(models, "default"), "default")
  })

  it("finds a model by its name and version, however they are written", () => {
    assert.strictEqual(matchModel(models, "claude-haiku-5-5"), "haiku")
    assert.strictEqual(matchModel(models, "Claude Haiku 5.5"), "haiku")
    assert.strictEqual(matchModel(models, "opus 5.5"), "opus")
    assert.strictEqual(matchModel(models, "Haiku 4.5"), "claude-haiku-4-5-20251001")
    assert.strictEqual(matchModel(models, "opus-5"), "claude-opus-5")
  })

  it("matches nothing rather than a different version", () => {
    assert.isUndefined(matchModel(models, "claude-haiku-6"))
    assert.isUndefined(matchModel(models, "gpt-5"))
    assert.isUndefined(matchModel(models, "  "))
  })
})

describe("SessionService", () => {
  it.live("starts a session in the project's checkout, without a worktree", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, title: "Fix login" })

        assert.isFalse(session.inWorktree)
        assert.strictEqual(session.worktreePath, project.localPath)
        assert.strictEqual(session.branch, "main")
        assert.isFalse(existsSync(join(home, "worktrees", project.id, session.id)))
        assert.strictEqual(
          git(repo, "worktree", "list", "--porcelain").match(/^worktree /gm)?.length,
          1,
        )
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("switches the checkout to the chosen branch, a remote one by its local name", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      git(repo, "branch", "feature")

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)

        const onFeature = yield* sessions.create({ projectId: project.id, baseBranch: "feature" })
        assert.strictEqual(onFeature.branch, "feature")
        assert.strictEqual(git(repo, "branch", "--show-current").trim(), "feature")

        const back = yield* sessions.create({ projectId: project.id, baseBranch: "main" })
        assert.strictEqual(back.branch, "main")
        assert.strictEqual(git(repo, "branch", "--show-current").trim(), "main")

        const missing = yield* Effect.flip(
          sessions.create({ projectId: project.id, baseBranch: "nope" }),
        )
        assert.strictEqual(missing._tag, "GitCommandFailed")
        assert.strictEqual(git(repo, "branch", "--show-current").trim(), "main")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("sets up a worktree on request: own branch, repo left alone, agent told", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const created = yield* sessions.create({
          projectId: project.id,
          title: "Fix login",
          prompt: "look around",
        })
        yield* waitForStatus(created.id, "idle")

        const session = yield* sessions.setupWorktree(created.id)
        assert.isTrue(session.inWorktree)
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
        // Already set up: nothing changes.
        assert.deepStrictEqual(yield* sessions.setupWorktree(session.id), session)

        // The next run resumes the conversation in the worktree, and the agent hears of the move.
        yield* sessions.sendMessage(session.id, "now fix it")
        yield* waitForStatus(session.id, "idle")
        const runs = yield* Ref.get(log.runs)
        assert.strictEqual(runs.length, 2)
        assert.strictEqual(runs[1]?.cwd, session.worktreePath)
        assert.strictEqual(runs[1]?.resume, "fake-sdk-session-1")
        const sent = (yield* Ref.get(log.sent)).map((message) => message.text)
        assert.match(sent[1] ?? "", /^\[Humanity\] This session now works in its own git worktree/)
        assert.match(sent[1] ?? "", /now fix it$/)
        const snapshot = yield* contents(session.id)
        assert.isTrue(
          snapshot.messages.some(
            (message) =>
              message.content._tag === "notice" && message.content.text.includes(session.branch),
          ),
        )
        // The transcript keeps the human's own words.
        assert.isTrue(
          snapshot.messages.some(
            (message) => message.content._tag === "user" && message.content.text === "now fix it",
          ),
        )
      }).pipe(Effect.provide(services(home, () => [{ text: "ok" }])))
    }),
  )

  it.live("refuses to set up a worktree while the agent works", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "go" })
        yield* waitForStatus(session.id, "running")

        const error = yield* Effect.flip(sessions.setupWorktree(session.id))
        assert.strictEqual(error._tag, "SessionBusy")
        assert.isFalse((yield* sessions.get(session.id)).inWorktree)
      }).pipe(Effect.provide(services(home, () => [{ hang: true }])))
    }),
  )

  it.live("runs the agent on the chosen model and keeps it after a restart", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      const sessionId = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const chosen = yield* sessions.create({
          projectId: project.id,
          model: "opus",
          prompt: "hi",
        })
        const unchosen = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(chosen.id, "idle")
        yield* waitForStatus(unchosen.id, "idle")

        assert.strictEqual(chosen.model, "opus")
        assert.isNull(unchosen.model)
        const models = (yield* Ref.get(log.runs)).map((run) => run.model)
        assert.sameMembers(models, ["opus", undefined])
        return chosen.id
      }).pipe(Effect.provide(services(home, () => [])))

      // A new "daemon" over the same data directory resumes on the same model.
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        assert.strictEqual((yield* sessions.get(sessionId)).model, "opus")
        yield* sessions.sendMessage(sessionId, "again")
        yield* waitForStatus(sessionId, "idle")
        assert.deepStrictEqual(
          (yield* Ref.get(log.runs)).map((run) => run.model),
          ["opus"],
        )
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("runs a thread as the account that was active when it started", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const first = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const accounts = yield* ClaudeAccountService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)

        const onDefault = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(onDefault.id, "idle")
        const work = yield* accounts.add("Work")
        yield* accounts.setActive(work.id)
        const onWork = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(onWork.id, "idle")

        const workDir = join(home, "accounts", work.id)
        assert.deepStrictEqual(
          (yield* Ref.get(log.runs)).map((run) => run.configDir),
          [undefined, workDir],
        )
        // An open thread still needs the account's login.
        assert.strictEqual(
          (yield* Effect.flip(accounts.remove(work.id)))._tag,
          "ClaudeAccountInUse",
        )
        // Switching back changes new threads only.
        yield* accounts.setActive("default")
        return { onWork: onWork.id, workDir }
      }).pipe(Effect.provide(services(home, () => [])))

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        yield* sessions.sendMessage(first.onWork, "again")
        yield* waitForStatus(first.onWork, "idle")
        assert.deepStrictEqual(
          (yield* Ref.get(log.runs)).map((run) => run.configDir),
          [first.workDir],
        )
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("switches an open thread's model, live and across a restart", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      const sessionId = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(session.id, "idle")
        const before = yield* sessions.get(session.id)

        // The run is still open between turns, so it switches in place.
        const updated = yield* sessions.setModel(session.id, " sonnet ")
        assert.strictEqual(updated.model, "sonnet")
        // The sidebar counts from `updatedAt`; a change of model is not a change of status.
        assert.strictEqual(updated.updatedAt, before.updatedAt)
        // Back to Claude Code's default, and a repeat of the same value is a no-op.
        assert.isNull((yield* sessions.setModel(session.id, null)).model)
        yield* sessions.setModel(session.id, null)
        yield* sessions.setModel(session.id, "opus")
        assert.deepStrictEqual(yield* Ref.get(log.modelChanges), ["sonnet", undefined, "opus"])
        assert.lengthOf(yield* Ref.get(log.runs), 1)
        return session.id
      }).pipe(Effect.provide(services(home, () => [])))

      // After a restart there is no run to switch: the next one starts on the stored model.
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        yield* sessions.setModel(sessionId, "haiku")
        assert.deepStrictEqual(yield* Ref.get(log.modelChanges), [])
        yield* sessions.sendMessage(sessionId, "again")
        yield* waitForStatus(sessionId, "idle")
        assert.deepStrictEqual(
          (yield* Ref.get(log.runs)).map((run) => run.model),
          ["haiku"],
        )

        yield* sessions.end(sessionId, { removeWorktree: false })
        const result = yield* sessions.setModel(sessionId, "opus").pipe(Effect.flip)
        assert.strictEqual(result._tag, "SessionEnded")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live(
    "gives the agent Humanity's MCP servers and skills, and their changes before a turn",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()
        yield* Effect.gen(function* () {
          const sessions = yield* SessionService
          const extensions = yield* ExtensionsService
          const log = yield* FakeAgentLog
          const project = yield* addProject(repo)
          yield* extensions.saveMcpServer(null, "docs", {
            _tag: "http",
            url: "https://docs.dev/mcp",
            headers: [],
          })

          const session = yield* sessions.create({ projectId: project.id, prompt: "hi" })
          yield* waitForStatus(session.id, "idle")
          const [run] = yield* Ref.get(log.runs)
          assert.deepStrictEqual(run?.extensions, {
            mcpServers: { docs: { type: "http", url: "https://docs.dev/mcp", headers: {} } },
            plugins: [join(home, "plugin")],
          })

          // Nothing changed: the next turn leaves the agent's servers alone.
          yield* sessions.sendMessage(session.id, "again")
          yield* waitForStatus(session.id, "idle")
          assert.lengthOf(yield* Ref.get(log.extensionChanges), 0)

          yield* extensions.setMcpServerEnabled("docs", false)
          yield* extensions.saveSkill(null, {
            name: "tidy",
            description: "Tidies",
            instructions: "",
          })
          yield* sessions.sendMessage(session.id, "/humanity:tidy the README")
          yield* waitForStatus(session.id, "idle")
          const changes = yield* Ref.get(log.extensionChanges)
          assert.lengthOf(changes, 1)
          assert.deepStrictEqual(changes[0]?.mcpServers, {})
          assert.lengthOf(yield* Ref.get(log.runs), 1)
        }).pipe(Effect.provide(services(home, () => [])))
      }),
  )

  it.live(
    "runs on the chosen reasoning effort, switches it live and keeps it after a restart",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup()

        const sessionId = yield* Effect.gen(function* () {
          const sessions = yield* SessionService
          const log = yield* FakeAgentLog
          const project = yield* addProject(repo)
          const session = yield* sessions.create({
            projectId: project.id,
            effort: "high",
            prompt: "hi",
          })
          yield* waitForStatus(session.id, "idle")
          const before = yield* sessions.get(session.id)
          assert.strictEqual(before.effort, "high")
          assert.deepStrictEqual(
            (yield* Ref.get(log.runs)).map((run) => run.effort),
            ["high"],
          )

          // The run is still open between turns, so it switches in place.
          const updated = yield* sessions.setEffort(session.id, "low")
          assert.strictEqual(updated.effort, "low")
          assert.strictEqual(updated.updatedAt, before.updatedAt)
          // Back to the model's default, and a repeat of the same value is a no-op.
          assert.isNull((yield* sessions.setEffort(session.id, null)).effort)
          yield* sessions.setEffort(session.id, null)
          yield* sessions.setEffort(session.id, "max")
          assert.deepStrictEqual(yield* Ref.get(log.effortChanges), ["low", undefined, "max"])
          return session.id
        }).pipe(Effect.provide(services(home, () => [])))

        // After a restart there is no run to switch: the next one starts on the stored effort.
        yield* Effect.gen(function* () {
          const sessions = yield* SessionService
          const log = yield* FakeAgentLog
          assert.strictEqual((yield* sessions.get(sessionId)).effort, "max")
          yield* sessions.sendMessage(sessionId, "again")
          yield* waitForStatus(sessionId, "idle")
          assert.deepStrictEqual(
            (yield* Ref.get(log.runs)).map((run) => run.effort),
            ["max"],
          )

          yield* sessions.end(sessionId, { removeWorktree: false })
          const result = yield* sessions.setEffort(sessionId, "low").pipe(Effect.flip)
          assert.strictEqual(result._tag, "SessionEnded")
        }).pipe(Effect.provide(services(home, () => [])))
      }),
  )

  it.live("reports the context window and the plan's windows, and keeps them", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const reported = {
        context: { usedTokens: 20_000, maxTokens: 200_000 },
        plan: {
          fiveHour: { utilization: 62, resetsAt: "2099-01-01T00:00:00.000Z" },
          sevenDay: { utilization: 30, resetsAt: "2099-01-05T00:00:00.000Z" },
          models: [{ name: "Fable", utilization: 80, resetsAt: null }],
        },
      }

      const sessionId = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const untouched = yield* sessions.create({ projectId: project.id })
        assert.deepStrictEqual((yield* contents(untouched.id)).usage, {
          context: null,
          plan: null,
        })

        const session = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(session.id, "idle")
        yield* eventually(
          "the usage of the first turn",
          Effect.map(contents(session.id), ({ usage }) =>
            usage.plan === null ? undefined : usage,
          ),
        )
        assert.deepStrictEqual((yield* contents(session.id)).usage, reported)
        return session.id
      }).pipe(Effect.provide(services(home, () => [{ text: "hello" }])))

      // After a restart no agent is running: the last report is still shown.
      yield* Effect.gen(function* () {
        assert.deepStrictEqual((yield* contents(sessionId)).usage, reported)
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("refreshes the plan's usage on demand, with or without a running agent", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const fromAgent = {
        fiveHour: { utilization: 62, resetsAt: "2099-01-01T00:00:00.000Z" },
        sevenDay: { utilization: 30, resetsAt: "2099-01-05T00:00:00.000Z" },
        models: [{ name: "Fable", utilization: 80, resetsAt: null }],
      }
      const fromIdleClaude: PlanUsage = {
        fiveHour: { utilization: 91, resetsAt: "2099-01-01T05:00:00.000Z" },
        sevenDay: null,
        models: [],
      }
      const probed: Array<string | undefined> = []
      let idleAnswer: Effect.Effect<PlanUsage | undefined, ClaudeProbeFailed> =
        Effect.succeed(fromIdleClaude)
      const planUsage = (configDir?: string) =>
        Effect.suspend(() => {
          probed.push(configDir)
          return idleAnswer
        })

      const sessionId = yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(session.id, "idle")

        // The running agent answers; no extra Claude Code is started.
        const refreshed = yield* sessions.refreshUsage(session.id)
        assert.deepStrictEqual(refreshed.plan, fromAgent)
        assert.isNotNull(refreshed.context)
        assert.deepStrictEqual(probed, [])

        const missing = yield* sessions.refreshUsage("no-such-session").pipe(Effect.flip)
        assert.strictEqual(missing._tag, "SessionNotFound")
        return session.id
      }).pipe(Effect.provide(services(home, () => [{ text: "hello" }], undefined, planUsage)))

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const before = (yield* contents(sessionId)).usage

        // No agent after a restart: an idle Claude Code on the session's account answers.
        const events = yield* sessions.subscribe(sessionId).pipe(
          Stream.filter((event) => event._tag === "UsageUpdated"),
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        )
        yield* Effect.sleep("20 millis")
        const refreshed = yield* sessions.refreshUsage(sessionId)
        assert.deepStrictEqual(refreshed, { context: before.context, plan: fromIdleClaude })
        assert.deepStrictEqual(probed, [undefined])
        assert.deepStrictEqual(
          (yield* Fiber.join(events)).map((event) => event._tag),
          ["UsageUpdated"],
        )
        assert.deepStrictEqual((yield* contents(sessionId)).usage, refreshed)

        // A failed check is reported and leaves the last numbers alone.
        idleAnswer = Effect.fail(new ClaudeProbeFailed({ reason: "not signed in" }))
        const failed = yield* sessions.refreshUsage(sessionId).pipe(Effect.flip)
        assert.strictEqual(failed._tag, "PlanUsageUnavailable")
        idleAnswer = Effect.succeed(undefined)
        const noPlan = yield* sessions.refreshUsage(sessionId).pipe(Effect.flip)
        assert.strictEqual(noPlan._tag, "PlanUsageUnavailable")
        assert.deepStrictEqual((yield* contents(sessionId)).usage, refreshed)
      }).pipe(Effect.provide(services(home, () => [], undefined, planUsage)))
    }),
  )

  it.live("streams every project's sessions again after each change", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const seen = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
        const watcher = yield* sessions.watchAll.pipe(
          Stream.runForEach((list) =>
            Ref.update(seen, (all) => [
              ...all,
              list.map((session) => `${session.title}:${session.status}`),
            ]),
          ),
          Effect.forkChild,
        )

        const lastIs = (expected: ReadonlyArray<string>) =>
          eventually(
            `the list ${expected.join(", ")}`,
            Effect.map(Ref.get(seen), (all) => {
              const last = all.at(-1)
              return last !== undefined && last.join() === expected.join() ? last : undefined
            }),
          )

        yield* lastIs([])
        const session = yield* sessions.create({ projectId: project.id, title: "First" })
        yield* lastIs(["First:idle"])
        yield* sessions.sendMessage(session.id, "Hello")
        yield* waitForStatus(session.id, "idle")
        yield* lastIs(["First:idle"])
        yield* sessions.end(session.id, { removeWorktree: false })
        yield* lastIs(["First:ended"])
        yield* Fiber.interrupt(watcher)
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

  it.live("runs auto tools without asking and denies deny-mode tools outright", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "app.ts": "export const a = 1\n" })

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const policy = yield* PolicyService.use((policies) => policies.get(project.id))
        yield* PolicyService.use((policies) =>
          policies.set(project.id, setToolRule(policy, "WebFetch", "deny")),
        )
        const session = yield* sessions.create({ projectId: project.id, prompt: "go" })
        yield* waitForStatus(session.id, "idle")

        const snapshot = yield* contents(session.id)
        assert.deepStrictEqual(
          snapshot.toolCalls.map((call) => [call.toolName, call.status]),
          [
            ["Read", "succeeded"],
            ["WebFetch", "denied"],
          ],
        )
        assert.match(snapshot.toolCalls[1]?.output?.content ?? "", /policy/)
        // Neither call reached a human.
        assert.deepStrictEqual(yield* Ref.get(log.permissions), [])
        assert.deepStrictEqual(snapshot.approvals, [])
        const [run] = yield* Ref.get(log.runs)
        assert.includeMembers([...(run?.allowedTools ?? [])], ["Read", "Glob", "Grep"])
        assert.notInclude([...(run?.allowedTools ?? [])], "Edit")
        assert.strictEqual(run?.cwd, session.worktreePath)
      }).pipe(
        Effect.provide(
          services(home, () => [
            { tool: "Read", input: { file_path: "app.ts" }, output: "export const a = 1" },
            { tool: "WebFetch", input: { url: "https://example.com" } },
            { text: "Done." },
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
        const created = yield* sessions.create({ projectId: project.id, title: "Temp" })
        const session = yield* sessions.setupWorktree(created.id)

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
        const session = yield* sessions.setupWorktree(
          (yield* sessions.create({ projectId: project.id })).id,
        )
        const inCheckout = yield* sessions.create({ projectId: project.id })
        assert.strictEqual(inCheckout.worktreePath, project.localPath)

        yield* sessions.stopProject(project.id)
        yield* projects.remove(project.id)

        assert.isFalse(existsSync(session.worktreePath))
        assert.isTrue(existsSync(join(repo, "README.md")))
        const rows = yield* sql`SELECT id FROM sessions`
        assert.strictEqual(rows.length, 0)
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("opens a thread the agent asked for, on its model and effort, without asking", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = (prompt) =>
        prompt === "delegate"
          ? [
              {
                tool: OPEN_THREAD_TOOL,
                input: {
                  prompt: "Fix the flaky login test",
                  title: "Flaky login",
                  model: "opus",
                  effort: "high",
                },
              },
              { text: "Opened." },
            ]
          : [{ text: "On it." }]

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const parent = yield* sessions.create({ projectId: project.id, prompt: "delegate" })
        yield* waitForStatus(parent.id, "idle")

        const call = (yield* contents(parent.id)).toolCalls.find(
          (toolCall) => toolCall.toolName === OPEN_THREAD_TOOL,
        )
        assert.strictEqual(call?.status, "succeeded")
        assert.deepStrictEqual(yield* Ref.get(log.permissions), [])
        const opened = (yield* sessions.list(project.id)).find(
          (session) => session.id !== parent.id,
        )
        // The agent is handed the link it puts in its reply.
        assert.include(
          call?.output?.content,
          `[Flaky login](${threadHref(project.id, opened?.id ?? "")})`,
        )

        const child = yield* waitForStatus(opened?.id ?? "", "idle")
        assert.strictEqual(child.title, "Flaky login")
        assert.strictEqual(child.worktreePath, project.localPath)
        assert.strictEqual(child.autonomy, "ask")
        const childRun = (yield* Ref.get(log.runs))[1]
        assert.strictEqual(childRun?.model, "opus")
        assert.strictEqual(childRun?.effort, "high")
        assert.deepStrictEqual(yield* Ref.get(log.prompts), [
          "delegate",
          "Fix the flaky login test",
        ])
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("tells the agent why no thread was opened", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = () => [{ tool: OPEN_THREAD_TOOL, input: { prompt: "   " } }]

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const parent = yield* sessions.create({ projectId: project.id, prompt: "delegate" })
        yield* waitForStatus(parent.id, "idle")

        const call = (yield* contents(parent.id)).toolCalls[0]
        assert.strictEqual(call?.status, "failed")
        assert.match(call?.output?.content ?? "", /No thread was opened/)
        assert.strictEqual((yield* sessions.list(project.id)).length, 1)
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("asks before opening a thread where the project's policy says so", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = () => [{ tool: OPEN_THREAD_TOOL, input: { prompt: "More" } }]

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const policies = yield* PolicyService
        const project = yield* addProject(repo)
        yield* policies.set(project.id, setToolRule(project.policy, OPEN_THREAD_TOOL, "confirm"))
        const parent = yield* sessions.create({ projectId: project.id, prompt: "delegate" })

        yield* waitForStatus(parent.id, "waiting_for_human")
        assert.strictEqual((yield* sessions.list(project.id)).length, 1)
      }).pipe(Effect.provide(services(home, script)))
    }),
  )

  it.live("gives projects from before open_thread its rule, and keeps a rule they chose", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const policies = yield* PolicyService
        const project = yield* addProject(repo)
        const before = {
          rules: project.policy.rules.filter((rule) => rule.pattern !== OPEN_THREAD_TOOL),
        }

        yield* policies.set(project.id, before)
        yield* openThreadPolicy
        assert.deepStrictEqual(yield* policies.get(project.id), {
          rules: [...before.rules, { pattern: OPEN_THREAD_TOOL, mode: "auto" }],
        })

        const chosen = setToolRule(before, OPEN_THREAD_TOOL, "deny")
        yield* policies.set(project.id, chosen)
        yield* openThreadPolicy
        assert.deepStrictEqual(yield* policies.get(project.id), chosen)
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
