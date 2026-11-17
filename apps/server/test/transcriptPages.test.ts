import { assert, describe, it } from "@effect/vitest"
import { type ChatMessage, SessionId, TRANSCRIPT_PAGE_SIZE } from "@humanity/contracts"
import { Effect } from "effect"
import { SessionRepo } from "../src/db/SessionRepo.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { addProject, contents, services, setup } from "./sessionHelpers.ts"

/** An assistant message that starts tool call `toolu_<n>`, so each page has tool calls to bring along. */
const toolMessage = (sessionId: SessionId, n: number): ChatMessage => ({
  id: `m${n}`,
  sessionId,
  content: {
    _tag: "assistant",
    blocks: [{ _tag: "tool_use", toolUseId: `toolu_${n}`, toolName: "Read", input: {} }],
    parentToolUseId: null,
  },
  createdAt: "2026-11-17T00:00:00.000Z",
})

const ids = (messages: ReadonlyArray<ChatMessage>) => messages.map((message) => message.id)

describe("transcript pages", () => {
  it.live("snapshots the latest messages and pages back through the rest", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const store = yield* SessionRepo
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, title: "Long" })
        const total = TRANSCRIPT_PAGE_SIZE * 2 + 50
        for (let n = 0; n < total; n++) {
          const message = toolMessage(session.id, n)
          yield* store.insertMessage(message, undefined)
          yield* store.insertToolCall({
            id: `tc${n}`,
            sessionId: session.id,
            toolUseId: `toolu_${n}`,
            toolName: "Read",
            input: {},
            output: null,
            status: "running",
            startedAt: message.createdAt,
            finishedAt: null,
          })
        }

        const snapshot = yield* contents(session.id)
        assert.isTrue(snapshot.hasEarlier)
        assert.strictEqual(snapshot.messages.length, TRANSCRIPT_PAGE_SIZE)
        assert.strictEqual(snapshot.messages[0]?.id, `m${total - TRANSCRIPT_PAGE_SIZE}`)
        assert.strictEqual(snapshot.messages.at(-1)?.id, `m${total - 1}`)
        // Only the tool calls of the messages it carries, in order.
        assert.deepStrictEqual(
          snapshot.toolCalls.map((call) => call.toolUseId),
          snapshot.messages.map((message) => message.id.replace("m", "toolu_")),
        )

        const first = snapshot.messages[0]?.id ?? ""
        const page = yield* sessions.earlierMessages(session.id, first)
        assert.isTrue(page.hasEarlier)
        assert.strictEqual(page.messages.at(-1)?.id, `m${total - TRANSCRIPT_PAGE_SIZE - 1}`)
        assert.strictEqual(page.toolCalls.length, TRANSCRIPT_PAGE_SIZE)

        const last = yield* sessions.earlierMessages(session.id, page.messages[0]?.id ?? "")
        assert.isFalse(last.hasEarlier)
        assert.deepStrictEqual(
          ids([...last.messages, ...page.messages, ...snapshot.messages]),
          Array.from({ length: total }, (_, n) => `m${n}`),
        )
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )

  it.live("has nothing earlier for a short thread, and refuses an unknown one", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const session = yield* sessions.create({ projectId: project.id, title: "Short" })
        assert.isFalse((yield* contents(session.id)).hasEarlier)

        const missing = yield* Effect.flip(sessions.earlierMessages(SessionId.make("nope"), "m1"))
        assert.strictEqual(missing._tag, "SessionNotFound")
      }).pipe(Effect.provide(services(home, () => [])))
    }),
  )
})
