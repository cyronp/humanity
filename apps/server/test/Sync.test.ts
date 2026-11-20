import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Ref } from "effect"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { FakeAgentLog } from "../src/agent/AgentRunnerFake.ts"
import { PullRequestService } from "../src/services/PullRequestService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { git, tempDir } from "./helpers.ts"
import { addProject, contents, services, setup, waitForStatus } from "./sessionHelpers.ts"

const withOrigin = (repo: string) =>
  Effect.gen(function* () {
    const origin = yield* tempDir("humanity-origin-")
    git(origin, "init", "--quiet", "--bare", "--initial-branch=main")
    git(repo, "remote", "add", "origin", origin)
    git(repo, "push", "--quiet", "--set-upstream", "origin", "main")
    const parent = yield* tempDir("humanity-teammate-")
    git(parent, "clone", "--quiet", origin, "teammate")
    const teammate = join(parent, "teammate")
    git(teammate, "config", "user.name", "Teammate")
    git(teammate, "config", "user.email", "teammate@humanity.local")
    git(teammate, "config", "commit.gpgsign", "false")
    git(teammate, "config", "core.autocrlf", "false")
    return { origin, teammate }
  })

const commitFile = (cwd: string, name: string, content: string, message: string) => {
  writeFileSync(join(cwd, name), content)
  git(cwd, "add", "--all")
  git(cwd, "commit", "--quiet", "--message", message)
}

const head = (cwd: string, ref = "HEAD") => git(cwd, "rev-parse", ref).trim()

const startThread = (repo: string) =>
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const project = yield* addProject(repo)
    const session = yield* sessions.create({ projectId: project.id, prompt: "look around" })
    yield* waitForStatus(session.id, "idle")
    return session
  })

const reasonOf = <A, E>(exit: Exit.Exit<A, E>) => {
  assert.isTrue(Exit.isFailure(exit))
  if (Exit.isSuccess(exit)) return ""
  return String(exit.cause)
}

describe("Sync", { timeout: 60_000 }, () => {
  it.live("fetches, fast-forwards and tells the agent which files changed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const { teammate } = yield* withOrigin(repo)

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const log = yield* FakeAgentLog
        const session = yield* startThread(repo)

        commitFile(teammate, "feature.ts", "export const x = 1\n", "teammate's work")
        git(teammate, "push", "--quiet")
        writeFileSync(join(repo, "notes.txt"), "the agent's scratch file\n")

        const stale = yield* pullRequests.syncStatus(session.id, false)
        assert.strictEqual(stale.behind, 0)
        const fresh = yield* pullRequests.syncStatus(session.id, true)
        assert.deepInclude(fresh, {
          branch: "main",
          hasRemote: true,
          target: "origin/main",
          pushes: true,
          behind: 1,
          ahead: 0,
          fetchError: null,
        })

        const result = yield* pullRequests.sync(session.id)
        assert.deepInclude(result, { pulled: 1, pushed: 0 })
        assert.deepStrictEqual(result.files, ["feature.ts"])
        assert.strictEqual(head(repo), head(teammate))
        assert.strictEqual(result.status.behind, 0)

        const notices = (yield* contents(session.id)).messages.filter(
          (message) => message.content._tag === "notice",
        )
        assert.isTrue(
          notices.some(
            (message) =>
              message.content._tag === "notice" &&
              message.content.text.startsWith("Synced main with origin/main"),
          ),
        )

        yield* sessions.sendMessage(session.id, "carry on")
        yield* waitForStatus(session.id, "idle")
        const sent = (yield* Ref.get(log.sent)).map((message) => message.text)
        assert.match(sent.at(-1) ?? "", /^\[Humanity\] The human synced main with origin\/main/)
        assert.include(sent.at(-1) ?? "", "feature.ts")
        assert.match(sent.at(-1) ?? "", /carry on$/)

        yield* sessions.sendMessage(session.id, "and again")
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual((yield* Ref.get(log.sent)).at(-1)?.text, "and again")
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )

  it.live("replays the branch's own commits on top, then pushes them", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const { origin, teammate } = yield* withOrigin(repo)

      yield* Effect.gen(function* () {
        const pullRequests = yield* PullRequestService
        const session = yield* startThread(repo)

        commitFile(teammate, "theirs.txt", "theirs\n", "theirs")
        git(teammate, "push", "--quiet")
        commitFile(repo, "ours.txt", "ours\n", "ours")

        const result = yield* pullRequests.sync(session.id)
        assert.deepInclude(result, { pulled: 1, pushed: 1 })
        assert.deepInclude(result.status, { ahead: 0, behind: 0 })
        assert.strictEqual(head(origin, "refs/heads/main"), head(repo))
        assert.strictEqual(git(repo, "log", "--format=%s", "-2").trim(), "ours\ntheirs")
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )

  it.live("leaves the folder alone when a rebase would need uncommitted work moved", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const { teammate } = yield* withOrigin(repo)

      yield* Effect.gen(function* () {
        const pullRequests = yield* PullRequestService
        const session = yield* startThread(repo)

        commitFile(teammate, "theirs.txt", "theirs\n", "theirs")
        git(teammate, "push", "--quiet")
        commitFile(repo, "ours.txt", "ours\n", "ours")
        writeFileSync(join(repo, "README.md"), "# edited by the agent\n")
        const before = head(repo)

        const exit = yield* Effect.exit(pullRequests.sync(session.id))
        assert.include(reasonOf(exit), "SyncUnavailable")
        assert.strictEqual(head(repo), before)
        assert.strictEqual(git(repo, "status", "--porcelain").trim(), "M README.md")
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )

  it.live("aborts a rebase that conflicts and names the files", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const { teammate } = yield* withOrigin(repo)

      yield* Effect.gen(function* () {
        const pullRequests = yield* PullRequestService
        const session = yield* startThread(repo)

        commitFile(teammate, "README.md", "# theirs\n", "theirs")
        git(teammate, "push", "--quiet")
        commitFile(repo, "README.md", "# ours\n", "ours")
        const before = head(repo)

        const exit = yield* Effect.exit(pullRequests.sync(session.id))
        const reason = reasonOf(exit)
        assert.include(reason, "conflicts in README.md")
        assert.strictEqual(head(repo), before)
        assert.strictEqual(git(repo, "status", "--porcelain").trim(), "")
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )

  it.live("updates a worktree thread's unpublished branch from origin's default branch", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const { teammate } = yield* withOrigin(repo)

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const pullRequests = yield* PullRequestService
        const created = yield* startThread(repo)
        const session = yield* sessions.setupWorktree(created.id)

        commitFile(teammate, "theirs.txt", "theirs\n", "theirs")
        git(teammate, "push", "--quiet")

        const status = yield* pullRequests.syncStatus(session.id, true)
        assert.deepInclude(status, { target: "origin/main", pushes: false, behind: 1 })

        const result = yield* pullRequests.sync(session.id)
        assert.deepInclude(result, { pulled: 1, pushed: 0 })
        assert.strictEqual(head(session.worktreePath), head(teammate))
        assert.strictEqual(
          git(repo, "rev-parse", "--abbrev-ref", "main@{upstream}").trim(),
          "origin/main",
        )
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )
})
