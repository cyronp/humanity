import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Ref } from "effect"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { FakeAgentLog, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { claudeAnchor, codexAnchor, forkPoint } from "../src/agent/forkPoint.ts"
import { CheckpointStore, parseNameStatus } from "../src/checkpoints/CheckpointStore.ts"
import { ServerConfig } from "../src/ServerConfig.ts"
import { GitService } from "../src/services/GitService.ts"
import { ProjectService } from "../src/services/ProjectService.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { git, tempDir, tempRepo } from "./helpers.ts"
import { addProject, contents, services, setup, tags, waitForStatus } from "./sessionHelpers.ts"

const storeLayer = (home: string) =>
  CheckpointStore.layer.pipe(
    Layer.provideMerge(GitService.layer),
    Layer.provideMerge(ServerConfig.layer({ home, port: 0 })),
    Layer.provideMerge(NodeServices.layer),
  )

const read = (path: string) => readFileSync(path, "utf8")

describe("parseNameStatus", () => {
  it("names what changed since the checkpoint, from git's -z output", () => {
    assert.deepStrictEqual(parseNameStatus("M\0a.txt\0A\0new dir/b.txt\0D\0gone.txt\0T\0link\0"), [
      { path: "a.txt", since: "modified" },
      { path: "new dir/b.txt", since: "added" },
      { path: "gone.txt", since: "deleted" },
      { path: "link", since: "modified" },
    ])
    assert.deepStrictEqual(parseNameStatus(""), [])
  })
})

describe("CheckpointStore", () => {
  it.live(
    "restores modified, deleted and added files, and leaves ignored ones and .git alone",
    () =>
      Effect.gen(function* () {
        const home = yield* tempDir()
        const repo = yield* tempRepo({
          ".gitignore": "build/\n",
          "a.txt": "one\r\ntwo\n",
          "keep/k.txt": "k\n",
        })
        yield* Effect.gen(function* () {
          const store = yield* CheckpointStore
          const checkpoint = yield* store.snapshot("s1", repo, undefined)
          assert.strictEqual(yield* store.snapshot("s1", repo, checkpoint), checkpoint)

          writeFileSync(join(repo, "a.txt"), "changed\n")
          rmSync(join(repo, "keep/k.txt"))
          mkdirSync(join(repo, "new/deep"), { recursive: true })
          writeFileSync(join(repo, "new/deep/n.txt"), "n\n")
          mkdirSync(join(repo, "build"))
          writeFileSync(join(repo, "build/out.js"), "built\n")
          const head = git(repo, "rev-parse", "HEAD")

          const { current, changes } = yield* store.changesSince("s1", repo, checkpoint)
          assert.sameDeepMembers(
            [...changes],
            [
              { path: "a.txt", since: "modified" },
              { path: "keep/k.txt", since: "deleted" },
              { path: "new/deep/n.txt", since: "added" },
            ],
          )

          const restored = yield* store.restore("s1", repo, checkpoint, current)
          assert.lengthOf(restored, 3)
          assert.strictEqual(read(join(repo, "a.txt")), "one\r\ntwo\n")
          assert.strictEqual(read(join(repo, "keep/k.txt")), "k\n")
          assert.isFalse(existsSync(join(repo, "new")))
          assert.strictEqual(read(join(repo, "build/out.js")), "built\n")
          assert.strictEqual(git(repo, "rev-parse", "HEAD"), head)
          assert.strictEqual(git(repo, "status", "--porcelain"), "")

          yield* store.restore("s1", repo, current, checkpoint)
          assert.strictEqual(read(join(repo, "a.txt")), "changed\n")
          assert.strictEqual(read(join(repo, "new/deep/n.txt")), "n\n")
          assert.isFalse(existsSync(join(repo, "keep/k.txt")))

          assert.isTrue(existsSync(join(home, "checkpoints", "s1", "HEAD")))
          yield* store.remove("s1")
          assert.isFalse(existsSync(join(home, "checkpoints", "s1")))
        }).pipe(Effect.provide(storeLayer(home)))
      }),
  )
})

describe("forkPoint", () => {
  const raw = (role: string, value: unknown) => ({ id: role, role, raw: value })

  it("reads Claude Code's and Codex's anchors", () => {
    assert.strictEqual(
      claudeAnchor({ type: "assistant", uuid: "u1", parent_tool_use_id: null }),
      "u1",
    )
    assert.isUndefined(claudeAnchor({ type: "assistant", uuid: "u1", parent_tool_use_id: "t" }))
    assert.isUndefined(claudeAnchor({ type: "result", uuid: "u1" }))
    assert.strictEqual(
      codexAnchor({ type: "codex", method: "turn/completed", params: { turn: { id: "t9" } } }),
      "t9",
    )
    assert.isUndefined(codexAnchor({ type: "codex", method: "turn/started", params: {} }))
  })

  it("forks at the newest anchor, unless the agent's session began after it", () => {
    const newestFirst = [
      raw("result", { type: "result", uuid: "r" }),
      raw("assistant", { type: "assistant", uuid: "a2", parent_tool_use_id: null }),
      raw("assistant", { type: "assistant", uuid: "a1", parent_tool_use_id: null }),
    ]
    const base = { provider: "claude-code" as const, sdkSessionId: "s", newestFirst }
    assert.deepStrictEqual(forkPoint({ ...base, switchedSince: false }), {
      _tag: "Native",
      at: "a2",
    })
    assert.deepStrictEqual(forkPoint({ ...base, switchedSince: true }), { _tag: "Handoff" })
    assert.deepStrictEqual(forkPoint({ ...base, sdkSessionId: null, switchedSince: false }), {
      _tag: "Handoff",
    })
    assert.deepStrictEqual(
      forkPoint({
        ...base,
        newestFirst: [raw("provider_switch", null), ...newestFirst],
        switchedSince: false,
      }),
      { _tag: "Handoff" },
    )
    assert.deepStrictEqual(forkPoint({ ...base, provider: "kiro", switchedSince: false }), {
      _tag: "Handoff",
    })
  })
})

const writes =
  (file: string): FakeScript =>
  (prompt) =>
    prompt.endsWith("write")
      ? [{ tool: "Write", input: { file_path: file, content: `${prompt}\n` } }, { text: "done" }]
      : [{ text: "ok" }]

describe("rewind", () => {
  it.live("restores the files and the conversation, then forks the agent's session there", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "a.txt": "start\n" })
      const file = join(repo, "a.txt")

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "first write" })
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(read(file), "first write\n")

        yield* sessions.sendMessage(session.id, "second write")
        yield* waitForStatus(session.id, "idle")
        assert.strictEqual(read(file), "second write\n")
        writeFileSync(join(repo, "extra.txt"), "made later\n")

        const before = yield* contents(session.id)
        const second = before.messages.find(
          (message) => message.content._tag === "user" && message.content.text === "second write",
        )
        assert.isDefined(second)

        const preview = yield* sessions.rewindPreview(session.id, second!.id)
        assert.isTrue(preview.checkpoint)
        assert.sameDeepMembers(
          [...preview.changes],
          [
            { path: "a.txt", since: "modified" },
            { path: "extra.txt", since: "added" },
          ],
        )
        assert.isTrue(preview.sharedCheckout)

        yield* sessions.rewind(session.id, second!.id, { files: true, conversation: true })
        assert.strictEqual(read(file), "first write\n")
        assert.isFalse(existsSync(join(repo, "extra.txt")))

        const after = yield* contents(session.id)
        assert.deepStrictEqual(tags(after.messages).slice(-1), ["rewind"])
        assert.isFalse(
          after.messages.some(
            (message) => message.content._tag === "user" && message.content.text === "second write",
          ),
        )
        const notice = after.messages.at(-1)!
        assert.deepInclude(notice.content, { restored: 2, undo: "available", conversation: true })

        const firstTurnUuid = "fake-uuid-1-2"
        yield* sessions.sendMessage(session.id, "third")
        yield* waitForStatus(session.id, "idle")
        const runs = yield* Ref.get(log.runs)
        assert.strictEqual(runs.at(-1)?.resume, "fake-sdk-session-1")
        assert.strictEqual(runs.at(-1)?.forkAt, firstTurnUuid)
        assert.strictEqual(
          (yield* sessions.get(session.id)).sdkSessionId,
          `fake-fork-${runs.length}`,
        )

        const undo = yield* Effect.flip(sessions.undoRewind(session.id, notice.id))
        assert.strictEqual(undo._tag, "RewindUnavailable")
      }).pipe(Effect.provide(services(home, writes(file))))
    }),
  )

  it.live("restores only the files, tells the agent, and can be undone", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "a.txt": "start\n" })
      const file = join(repo, "a.txt")

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "first write" })
        yield* waitForStatus(session.id, "idle")
        const first = (yield* contents(session.id)).messages[0]!

        yield* sessions.rewind(session.id, first.id, { files: true, conversation: false })
        assert.strictEqual(read(file), "start\n")
        const notice = (yield* contents(session.id)).messages.at(-1)!
        assert.strictEqual(notice.content._tag, "rewind")
        assert.isTrue(
          (yield* contents(session.id)).messages.some(
            (message) => message.content._tag === "user" && message.content.text === "first write",
          ),
        )

        yield* sessions.undoRewind(session.id, notice.id)
        assert.strictEqual(read(file), "first write\n")
        const undone = (yield* contents(session.id)).messages.find((m) => m.id === notice.id)
        assert.deepInclude(undone?.content, { undo: "done" })

        yield* sessions.sendMessage(session.id, "go on")
        yield* waitForStatus(session.id, "idle")
        const sent = (yield* Ref.get(log.sent)).at(-1)?.text ?? ""
        assert.include(sent, "restored the files")
        assert.include(sent, "undid a restore of the files")
        assert.match(sent, /go on$/)
      }).pipe(Effect.provide(services(home, writes(file))))
    }),
  )

  it.live("refuses without a checkpoint, and while the agent works", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")
        const missing = yield* Effect.flip(
          sessions.rewind(session.id, "nope", { files: true, conversation: true }),
        )
        assert.strictEqual(missing._tag, "RewindUnavailable")
        const nothing = yield* Effect.flip(
          sessions.rewind(session.id, "nope", { files: false, conversation: false }),
        )
        assert.strictEqual(nothing._tag, "RewindUnavailable")
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )

  it.live("gives a new thread's first prompt to an agent in its worktree", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const projects = yield* ProjectService
        const log = yield* FakeAgentLog
        const project = yield* addProject(repo)
        yield* projects.setSettings(project.id, {
          ...project.settings,
          worktreeForNewThreads: true,
        })
        const session = yield* sessions.create({ projectId: project.id, prompt: "hello" })
        yield* waitForStatus(session.id, "idle")
        assert.isTrue(session.inWorktree)
        assert.strictEqual((yield* Ref.get(log.runs))[0]?.cwd, session.worktreePath)
      }).pipe(Effect.provide(services(home, () => [{ text: "hi" }])))
    }),
  )
})

describe("fork", () => {
  it.live(
    "forks the whole thread into a worktree of its own, with its files and conversation",
    () =>
      Effect.gen(function* () {
        const { home, repo } = yield* setup({ "a.txt": "start\n", "gone.txt": "bye\n" })
        const file = join(repo, "a.txt")

        yield* Effect.gen(function* () {
          const sessions = yield* SessionService
          const log = yield* FakeAgentLog
          const project = yield* addProject(repo)
          const source = yield* sessions.create({ projectId: project.id, prompt: "first write" })
          yield* waitForStatus(source.id, "idle")
          rmSync(join(repo, "gone.txt"))
          writeFileSync(join(repo, "new.txt"), "untracked\n")

          const forked = yield* sessions.fork(source.id, undefined)
          assert.strictEqual(forked.parentId, source.id)
          assert.strictEqual(forked.relation, "forked")
          assert.isTrue(forked.inWorktree)
          assert.notStrictEqual(forked.worktreePath, repo)
          assert.strictEqual(read(join(forked.worktreePath, "a.txt")), "first write\n")
          assert.strictEqual(read(join(forked.worktreePath, "new.txt")), "untracked\n")
          assert.isFalse(existsSync(join(forked.worktreePath, "gone.txt")))
          assert.strictEqual(read(file), "first write\n")

          const copied = yield* contents(forked.id)
          assert.strictEqual(tags(copied.messages)[0], "user")
          assert.include(tags(copied.messages), "assistant")
          assert.strictEqual(copied.messages.at(-1)?.content._tag, "notice")
          assert.isTrue(copied.toolCalls.some((call) => call.toolName === "Write"))

          yield* sessions.sendMessage(forked.id, "carry on")
          yield* waitForStatus(forked.id, "idle")
          const sent = (yield* Ref.get(log.sent)).at(-1)?.text ?? ""
          assert.include(sent, "<humanity-handoff>")
          assert.include(sent, "was forked from another thread")
          assert.include(sent, "Human: first write")
          assert.isUndefined((yield* Ref.get(log.runs)).at(-1)?.resume)
        }).pipe(Effect.provide(services(home, writes(file))))
      }),
  )

  it.live("forks from before a message with the files as they were then", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup({ "a.txt": "start\n" })
      const file = join(repo, "a.txt")

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const source = yield* sessions.create({ projectId: project.id, prompt: "first write" })
        yield* waitForStatus(source.id, "idle")
        yield* sessions.sendMessage(source.id, "second write")
        yield* waitForStatus(source.id, "idle")
        const second = (yield* contents(source.id)).messages.find(
          (message) => message.content._tag === "user" && message.content.text === "second write",
        )!

        const forked = yield* sessions.fork(source.id, second.id)
        assert.strictEqual(forked.forkedAtMessageId, second.id)
        assert.strictEqual(read(join(forked.worktreePath, "a.txt")), "first write\n")
        assert.strictEqual(read(file), "second write\n")
        const texts = (yield* contents(forked.id)).messages.flatMap((message) =>
          message.content._tag === "user" ? [message.content.text] : [],
        )
        assert.deepStrictEqual(texts, ["first write"])

        yield* sessions.end(source.id, { removeWorktree: false })
        const refused = yield* Effect.flip(sessions.fork(source.id, undefined))
        assert.strictEqual(refused._tag, "ForkUnavailable")
      }).pipe(Effect.provide(services(home, writes(file))))
    }),
  )
})
