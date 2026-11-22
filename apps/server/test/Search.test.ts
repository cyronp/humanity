import { assert, describe, it } from "@effect/vitest"
import { SEARCH_MARK_END, SEARCH_MARK_START, snippetParts } from "@humanity/contracts"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { matchExpression, searchEntries } from "../src/db/searchIndex.ts"
import { SessionService } from "../src/services/SessionService.ts"
import { git, tempRepo } from "./helpers.ts"
import { addProject, contents, services, setup, waitForStatus } from "./sessionHelpers.ts"

describe("searchEntries", () => {
  it("indexes the human's text, the agent's text and one line per tool call", () => {
    assert.deepStrictEqual(searchEntries({ _tag: "user", text: "Fix the login bug" }), [
      { kind: "human", body: "Fix the login bug" },
    ])
    assert.deepStrictEqual(
      searchEntries({
        _tag: "assistant",
        parentToolUseId: null,
        blocks: [
          { _tag: "thinking", text: "secret thoughts" },
          { _tag: "text", text: "Looking at it." },
          { _tag: "tool_use", toolUseId: "t1", toolName: "Bash", input: { command: "npm test" } },
        ],
      }),
      [
        { kind: "agent", body: "Looking at it." },
        { kind: "tool", body: "Ran `npm test`" },
      ],
    )
    assert.deepStrictEqual(searchEntries({ _tag: "notice", level: "info", text: "hi" }), [])
  })
})

describe("matchExpression", () => {
  it("quotes each term of three characters or more, and drops the rest", () => {
    assert.strictEqual(matchExpression('login "bug" ab'), '"login" """bug"""')
    assert.isUndefined(matchExpression("ab  c"))
    assert.isUndefined(matchExpression(""))
  })
})

describe("snippetParts", () => {
  it("splits a snippet into marked and plain parts", () => {
    assert.deepStrictEqual(snippetParts(`…the ${SEARCH_MARK_START}log${SEARCH_MARK_END}in bug`), [
      { text: "…the ", marked: false },
      { text: "log", marked: true },
      { text: "in bug", marked: false },
    ])
  })
})

describe("Sessions.search", () => {
  it.live("finds messages and tool calls of every thread, and forgets what is removed", () =>
    Effect.gen(function* () {
      const { home, repo } = yield* setup()
      const other = yield* tempRepo()
      git(other, "branch", "-m", "main")

      yield* Effect.gen(function* () {
        const sessions = yield* SessionService
        const project = yield* addProject(repo)
        const second = yield* addProject(other)
        const first = yield* sessions.create({
          projectId: project.id,
          prompt: "Why does the Webhook retry fail?",
        })
        yield* waitForStatus(first.id, "idle")
        const elsewhere = yield* sessions.create({
          projectId: second.id,
          prompt: "Add a webhook signature check",
        })
        yield* waitForStatus(elsewhere.id, "idle")

        const hits = yield* sessions.search({ query: "webhook" })
        assert.sameMembers(
          hits.map((hit) => hit.sessionId),
          [first.id, elsewhere.id],
        )
        const human = hits.find((hit) => hit.sessionId === first.id)
        assert.strictEqual(human?.kind, "human")
        assert.include(human?.snippet, `${SEARCH_MARK_START}Webhook${SEARCH_MARK_END}`)

        const tool = yield* sessions.search({ query: "npm run lint" })
        assert.deepStrictEqual(
          tool.map((hit) => hit.kind),
          ["tool", "tool"],
        )

        const onlySecond = yield* sessions.search({ query: "webhook", projectIds: [second.id] })
        assert.deepStrictEqual(
          onlySecond.map((hit) => hit.sessionId),
          [elsewhere.id],
        )
        assert.deepStrictEqual(yield* sessions.search({ query: "we" }), [])

        const message = (yield* contents(first.id)).messages[0]!
        yield* sessions.rewind(first.id, message.id, { files: false, conversation: true })
        assert.deepStrictEqual(
          (yield* sessions.search({ query: "retry" })).map((hit) => hit.sessionId),
          [],
        )

        const sql = yield* SqlClient.SqlClient
        yield* sql`DELETE FROM sessions WHERE id = ${elsewhere.id}`
        assert.deepStrictEqual(yield* sessions.search({ query: "signature" }), [])
      }).pipe(
        Effect.provide(
          services(home, () => [
            { tool: "Bash", input: { command: "npm run lint" } },
            { text: "Checked." },
          ]),
        ),
      )
    }),
  )
})
