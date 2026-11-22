import { assert, describe, it } from "@effect/vitest"
import {
  type MessageContent,
  OPEN_THREAD_TOOL,
  openedThreadIn,
  threadHref,
  type PlanUsage,
  type SessionEvent,
} from "@humanity/contracts"
import { Effect, Fiber, Ref, Stream } from "effect"
import { SqlClient } from "effect/sql"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { FakeAgentLog, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { answerMcp, HumanityMcp } from "../src/mcp/HumanityMcp.ts"
import { ClaudeProbeFailed } from "../src/claude/ClaudeCode.ts"
import { Kiro } from "../src/kiro/Kiro.ts"
import { ClaudeAccountService } from "../src/services/ClaudeAccountService.ts"
import { ExtensionsService } from "../src/services/ExtensionsService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { PreferencesService } from "../src/services/PreferencesService.ts"
import { PullRequestService } from "../src/services/PullRequestService.ts"
import {
  matchModel,
  SessionService,
  sessionBranchName,
  setupCommand,
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
    assert.strictEqual(
      sessionBranchName("1234abcd-ffff-4000-8000-000000000000", "Add tests", "me/"),
      "me/1234abcd-add-tests",
    )
    assert.strictEqual(
      sessionBranchName("1234abcd-ffff-4000-8000-000000000000", "Add tests", ""),
      "1234abcd-add-tests",
    )
  })

  it("joins a setup script's lines into one command and skips an empty one", () => {
    assert.strictEqual(
      setupCommand("npm install\r\n\n  cp .env.example .env  "),
      "npm install && cp .env.example .env",
    )
    assert.isUndefined(setupCommand("  \n "))
    assert.isUndefined(setupCommand(null))
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

  it.live("starts a new thread in a worktree on the project's branch prefix when it asks", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const projects = yield* ProjectService
        const project = yield* addProject(repo)
        yield* projects.setSettings(project.id, {
          ...project.settings,
          worktreeForNewThreads: true,
          branchPrefix: "me/",
        })
        const session = yield* sessions.create({ projectId: project.id, title: "Fix login" })

        assert.isTrue(session.inWorktree)
        assert.match(session.branch, /^me\/[0-9a-f]{8}-fix-login$/)
        assert.strictEqual(session.worktreePath, join(home, "worktrees", project.id, session.id))
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
        assert.strictEqual(git(repo, "branch", "--show-current").trim(), "main")
        assert.deepStrictEqual(yield* sessions.setupWorktree(session.id), session)

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
        assert.isTrue(
          snapshot.messages.some(
            (message) => message.content._tag === "user" && message.content.text === "now fix it",
          ),
        )
      }).pipe(Effect.provide(services(home, () => [{ text: "ok" }])))
    }),
  )

  it.live("keeps the files picked with @ that a message still mentions", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const created = yield* sessions.create({
          projectId: project.id,
          prompt: "read @README.md please",
          mentions: ["README.md", "removed.ts"],
        })
        yield* waitForStatus(created.id, "idle")
        yield* sessions.sendMessage(created.id, "and @src/", [], ["src/", "src/"])
        yield* waitForStatus(created.id, "idle")
        yield* sessions.sendMessage(created.id, "thanks")
        yield* waitForStatus(created.id, "idle")

        const users = (yield* contents(created.id)).messages.flatMap((message) =>
          message.content._tag === "user" ? [message.content] : [],
        )
        assert.deepStrictEqual(
          users.map((content) => content.mentions),
          [["README.md"], ["src/"], undefined],
        )
        const sent = (yield* Ref.get(log.sent)).map((message) => message.text)
        assert.deepStrictEqual(sent, ["read @README.md please", "and @src/", "thanks"])
      }).pipe(Effect.provide(services(home, () => [{ text: "ok" }])))
    }),
  )

  it.live("keeps a thread on its own branch when another thread moves the shared checkout", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const script: FakeScript = (prompt) => {
        if (prompt.includes("branch off")) git(repo, "checkout", "--quiet", "-b", "feat/a")
        return [{ text: "ok" }]
      }

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const project = yield* addProject(repo)
        const first = yield* sessions.create({ projectId: project.id, prompt: "branch off" })
        yield* waitForStatus(first.id, "idle")
        assert.strictEqual((yield* sessions.get(first.id)).branch, "feat/a")

        writeFileSync(join(repo, "a.txt"), "a\n")
        yield* sessions.commit(first.id, "add a")

        const second = yield* sessions.create({ projectId: project.id, baseBranch: "main" })
        assert.strictEqual(second.branch, "main")
        assert.strictEqual((yield* sessions.get(first.id)).branch, "feat/a")

        const commits = yield* sessions.commits(first.id)
        assert.deepInclude(commits, { branch: "feat/a", base: "main", more: false })
        assert.deepStrictEqual(
          commits.commits.map((commit) => commit.subject),
          ["add a"],
        )
        const onMain = yield* sessions.commits(second.id)
        assert.deepInclude(onMain, { branch: "main", base: null })
        assert.deepStrictEqual(
          onMain.commits.map((commit) => commit.subject),
          ["initial"],
        )

        writeFileSync(join(repo, "b.txt"), "b\n")
        assert.deepInclude(yield* pullRequests.publication(first.id), {
          branch: "feat/a",
          checkedOut: "main",
          uncommitted: 0,
        })
        assert.deepInclude(yield* pullRequests.publication(second.id), {
          branch: "main",
          checkedOut: "main",
          uncommitted: 1,
        })
        const refused = yield* Effect.flip(sessions.commit(first.id, "add b"))
        assert.deepInclude(refused, {
          _tag: "BranchNotCheckedOut",
          branch: "feat/a",
          checkedOut: "main",
        })
        assert.strictEqual(git(repo, "rev-list", "--count", "feat/a").trim(), "2")

        const moved = yield* sessions.setupWorktree(first.id)
        assert.isTrue(existsSync(join(moved.worktreePath, "a.txt")))
        assert.isFalse(existsSync(join(moved.worktreePath, "b.txt")))
      }).pipe(Effect.provide(services(home, script)))
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
        assert.strictEqual((yield* Effect.flip(accounts.remove(work.id)))._tag, "AccountInUse")
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

        const updated = yield* sessions.setModel(session.id, " sonnet ")
        assert.strictEqual(updated.model, "sonnet")
        assert.strictEqual(updated.updatedAt, before.updatedAt)
        assert.isNull((yield* sessions.setModel(session.id, null)).model)
        yield* sessions.setModel(session.id, null)
        yield* sessions.setModel(session.id, "opus")
        assert.deepStrictEqual(yield* Ref.get(log.modelChanges), ["sonnet", undefined, "opus"])
        assert.lengthOf(yield* Ref.get(log.runs), 1)
        return session.id
      }).pipe(Effect.provide(services(home, () => [])))

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
          const { humanity, ...added } = run?.extensions.mcpServers ?? {}
          assert.deepStrictEqual(added, {
            docs: { type: "http", url: "https://docs.dev/mcp", headers: {} },
          })
          assert.deepStrictEqual(run?.extensions.plugins, [join(home, "plugin")])
          assert.strictEqual(humanity?.type, "http")
          assert.match(
            humanity?.type === "http" ? (humanity.headers["Authorization"] ?? "") : "",
            /^Bearer [\w-]{43}$/,
          )

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
          assert.deepStrictEqual(changes[0]?.mcpServers, { ...(humanity && { humanity }) })
          assert.lengthOf(yield* Ref.get(log.runs), 1)
        }).pipe(Effect.provide(services(home, () => [])))
      }),
  )

  it.live("gives a new thread only the Humanity tools turned on in Settings", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const preferences = yield* PreferencesService
        const mcp = yield* HumanityMcp
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)

        yield* preferences.setTools({ terminals: true, openThread: false, skills: false })
        const terminalsOnly = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(terminalsOnly.id, "idle")
        const [first] = yield* Ref.get(log.runs)
        assert.isFalse(first?.offersOpenThread)
        const server = first?.extensions.mcpServers["humanity"]
        const tools = mcp.toolsFor(server?.type === "http" ? server.headers["Authorization"] : "")
        assert.isDefined(tools)
        const listed = yield* answerMcp(tools!, { jsonrpc: "2.0", id: 1, method: "tools/list" })
        const names = (
          listed.body as { result: { tools: ReadonlyArray<{ name: string }> } }
        ).result.tools.map((tool) => tool.name)
        assert.notInclude(names, "open_thread")
        assert.include(names, "terminal_read")

        yield* preferences.setTools({ terminals: false, openThread: false, skills: false })
        const neither = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(neither.id, "idle")
        const second = (yield* Ref.get(log.runs))[1]
        assert.isFalse(second?.offersOpenThread)
        assert.notProperty(second?.extensions.mcpServers ?? {}, "humanity")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("gives a thread the skills of the human's other agents through load_skill", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const codexSkill = join(home, "user-home", ".codex", "skills", "architecture")
      const claudeSkill = join(home, "user-home", ".claude", "skills", "frontend")
      mkdirSync(codexSkill, { recursive: true })
      mkdirSync(claudeSkill, { recursive: true })
      writeFileSync(
        join(codexSkill, "SKILL.md"),
        ["---", "name: architecture", "description: Deepens modules", "---", "Find seams."].join(
          "\n",
        ),
      )
      writeFileSync(
        join(claudeSkill, "SKILL.md"),
        ["---", "name: frontend", "description: Builds UIs", "---", "Use tokens."].join("\n"),
      )
      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const preferences = yield* PreferencesService
        const mcp = yield* HumanityMcp
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)

        yield* preferences.setTools({ terminals: false, openThread: false, skills: true })
        const thread = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(thread.id, "idle")
        const [run] = yield* Ref.get(log.runs)
        const server = run?.extensions.mcpServers["humanity"]
        const tools = mcp.toolsFor(server?.type === "http" ? server.headers["Authorization"] : "")
        assert.isDefined(tools)
        const listed = yield* answerMcp(tools!, { jsonrpc: "2.0", id: 1, method: "tools/list" })
        const [tool] = (
          listed.body as {
            result: { tools: ReadonlyArray<{ name: string; description: string }> }
          }
        ).result.tools
        assert.strictEqual(tool?.name, "load_skill")
        assert.include(tool?.description, "- architecture: Deepens modules")
        assert.notInclude(tool?.description, "frontend")

        const loaded = yield* answerMcp(tools!, {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "load_skill", arguments: { name: "architecture" } },
        })
        const text = (loaded.body as { result: { content: ReadonlyArray<{ text: string }> } })
          .result.content[0]?.text
        assert.include(text, "Find seams.")

        yield* preferences.setTools({ terminals: false, openThread: false, skills: false })
        const off = yield* sessions.create({ projectId: project.id, prompt: "hi" })
        yield* waitForStatus(off.id, "idle")
        assert.notProperty((yield* Ref.get(log.runs))[1]?.extensions.mcpServers ?? {}, "humanity")
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

          const updated = yield* sessions.setEffort(session.id, "low")
          assert.strictEqual(updated.effort, "low")
          assert.strictEqual(updated.updatedAt, before.updatedAt)
          assert.isNull((yield* sessions.setEffort(session.id, null)).effort)
          yield* sessions.setEffort(session.id, null)
          yield* sessions.setEffort(session.id, "max")
          assert.deepStrictEqual(yield* Ref.get(log.effortChanges), ["low", undefined, "max"])
          return session.id
        }).pipe(Effect.provide(services(home, () => [])))

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

  it.live("runs read-only tools without ever asking, and the rest by the thread's autonomy", () =>
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
            ["WebFetch", "succeeded"],
          ],
        )
        assert.deepStrictEqual(
          (yield* Ref.get(log.permissions)).map((entry) => [entry.toolName, entry.decision]),
          [["WebFetch", { behavior: "allow" }]],
        )
        assert.deepStrictEqual(snapshot.approvals, [])
        const [run] = yield* Ref.get(log.runs)
        assert.includeMembers([...(run?.allowedTools ?? [])], ["Read", "Glob", "Grep"])
        assert.notInclude([...(run?.allowedTools ?? [])], "Edit")
        assert.notInclude([...(run?.allowedTools ?? [])], "WebFetch")
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

  it.live(
    "opens a thread the agent asked for, on its model and effort, even from one that asks",
    () =>
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
          const parent = yield* sessions.create({
            projectId: project.id,
            prompt: "delegate",
            autonomy: "ask",
          })
          yield* waitForStatus(parent.id, "idle")

          const call = (yield* contents(parent.id)).toolCalls.find(
            (toolCall) => toolCall.toolName === OPEN_THREAD_TOOL,
          )
          assert.strictEqual(call?.status, "succeeded")
          assert.deepStrictEqual(yield* Ref.get(log.permissions), [])
          const opened = (yield* sessions.list(project.id)).find(
            (session) => session.id !== parent.id,
          )
          assert.include(
            call?.output?.content,
            `[Flaky login](${threadHref(project.id, opened?.id ?? "")})`,
          )

          const child = yield* waitForStatus(opened?.id ?? "", "idle")
          assert.strictEqual(child.title, "Flaky login")
          assert.strictEqual(child.worktreePath, project.localPath)
          assert.strictEqual(child.autonomy, "auto")
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

  it.live("opens a thread on another provider, on a model that provider offers", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const kiro = Kiro.layerTest({
        probe: () =>
          Effect.succeed({
            cliVersion: "2.32.0",
            kiroHome: "/home/me/.kiro",
            signedIn: true,
            models: [
              { value: "auto", displayName: "Auto", description: "" },
              { value: "claude-sonnet-5.5", displayName: "Claude Sonnet 5.5", description: "" },
            ],
          }),
      })
      const script: FakeScript = (prompt) =>
        prompt === "delegate"
          ? [
              {
                tool: OPEN_THREAD_TOOL,
                input: { prompt: "Port it", provider: "kiro", model: "Sonnet 5.5", effort: "max" },
              },
              {
                tool: OPEN_THREAD_TOOL,
                input: { prompt: "Again", provider: "kiro", model: "gpt-9" },
              },
            ]
          : []

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const parent = yield* sessions.create({ projectId: project.id, prompt: "delegate" })
        yield* waitForStatus(parent.id, "idle")

        const [opened, refused] = (yield* contents(parent.id)).toolCalls
        assert.strictEqual(opened?.status, "succeeded")
        assert.include(opened?.output?.content, "on Kiro, claude-sonnet-5.5, max effort")
        assert.strictEqual(refused?.status, "failed")
        assert.include(refused?.output?.content, '"gpt-9" is not a model Kiro offers')
        assert.include(refused?.output?.content, "claude-sonnet-5.5 (Claude Sonnet 5.5)")

        const child = (yield* sessions.list(project.id)).find((session) => session.id !== parent.id)
        assert.strictEqual(child?.provider, "kiro")
        assert.strictEqual(child?.model, "claude-sonnet-5.5")
        assert.strictEqual(child?.effort, "max")
        assert.strictEqual(child?.parentId, parent.id)
        assert.strictEqual(child?.relation, "opened")
        assert.isNull((yield* sessions.get(parent.id)).parentId)
        assert.deepStrictEqual(openedThreadIn(opened?.output?.content ?? ""), {
          projectId: project.id,
          sessionId: child?.id,
        })
        assert.lengthOf(yield* sessions.list(project.id), 2)
        const childRun = (yield* Ref.get(log.runs)).find((run) => run.provider === "kiro")
        assert.strictEqual(childRun?.model, "claude-sonnet-5.5")
      }).pipe(Effect.provide(services(home, script, undefined, undefined, undefined, kiro)))
    }),
  )

  it.live("opens no thread on a provider nobody is signed in to", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const kiro = Kiro.layerTest({
        probe: () =>
          Effect.succeed({
            cliVersion: null,
            kiroHome: "/home/me/.kiro",
            signedIn: false,
            models: [],
          }),
      })
      const script: FakeScript = (prompt) =>
        prompt === "delegate"
          ? [{ tool: OPEN_THREAD_TOOL, input: { prompt: "Port it", provider: "kiro" } }]
          : []

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const parent = yield* sessions.create({ projectId: project.id, prompt: "delegate" })
        yield* waitForStatus(parent.id, "idle")

        const [call] = (yield* contents(parent.id)).toolCalls
        assert.strictEqual(call?.status, "failed")
        assert.include(call?.output?.content, "nobody is signed in to Kiro")
        assert.lengthOf(yield* sessions.list(project.id), 1)
      }).pipe(Effect.provide(services(home, script, undefined, undefined, undefined, kiro)))
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
