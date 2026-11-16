import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { fileURLToPath } from "node:url"
import { AcpFailed, type AgentMessage, connectAcp } from "../src/acp/Connection.ts"
import { eventually } from "./sessionHelpers.ts"

const FIXTURE = fileURLToPath(new URL("./fixtures/acp-agent.mjs", import.meta.url))

const env = (): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) result[key] = value
  }
  return result
}

/** A real process speaking ACP: the fixture agent, run by this Node. */
const connect = (
  onRequest: (request: AgentMessage) => Effect.Effect<unknown, AcpFailed> = () =>
    Effect.fail(new AcpFailed({ reason: "not answered", unsupported: true })),
) =>
  Effect.gen(function* () {
    const notifications: Array<AgentMessage> = []
    const connection = yield* connectAcp({
      product: "Fixture",
      executable: process.execPath,
      args: [FIXTURE],
      cwd: process.cwd(),
      env: env(),
      onRequest,
      onNotification: (notification) => Effect.sync(() => void notifications.push(notification)),
    })
    return { connection, notifications }
  })

describe("an ACP connection", () => {
  it.live("shakes hands as a client that lends the agent neither files nor a terminal", () =>
    Effect.gen(function* () {
      const { connection } = yield* connect()
      assert.deepStrictEqual(connection.agent.agentInfo, { name: "fixture", version: "1.2.3" })
      assert.strictEqual(connection.agent.agentCapabilities?.loadSession, true)

      assert.deepStrictEqual(yield* connection.request("client"), {
        protocolVersion: 1,
        clientInfo: { name: "humanity", title: "Humanity", version: "0.1.0" },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      })
      assert.deepStrictEqual(yield* connection.request("echo", { a: 1 }), { a: 1 })
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.live("fails a request with the agent's own words", () =>
    Effect.gen(function* () {
      const { connection } = yield* connect()
      const failure = yield* Effect.flip(connection.request("fail"))
      assert.strictEqual(failure.reason, "Sign in first.")
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.live("hands on what the agent reports before the answer that follows it", () =>
    Effect.gen(function* () {
      const asked: Array<AgentMessage> = []
      const { connection, notifications } = yield* connect((request) =>
        Effect.sync(() => {
          asked.push(request)
          return { outcome: "allowed" }
        }),
      )
      const seenAtAnswer = yield* connection
        .request("work", { ask: "session/request_permission" })
        .pipe(Effect.map(() => notifications.map((notification) => notification.params)))

      assert.deepStrictEqual(asked, [
        { method: "session/request_permission", params: { toolCallId: "t1" } },
      ])
      assert.deepStrictEqual(seenAtAnswer, [
        { step: 1 },
        { step: 2 },
        { answer: { outcome: "allowed" } },
      ])
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.live("tells the agent when it asks for something Humanity does not do", () =>
    Effect.gen(function* () {
      const { connection, notifications } = yield* connect()
      yield* connection.request("work", { ask: "fs/write_text_file" })
      assert.deepStrictEqual(notifications[2]?.params, {
        answer: { code: -32601, message: "not answered" },
      })
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.live("sends a notification without waiting for an answer", () =>
    Effect.gen(function* () {
      const { connection, notifications } = yield* connect()
      yield* connection.notify("ping")
      const pong = yield* eventually(
        "the agent's reply",
        Effect.sync(() => notifications[0]),
      )
      assert.deepStrictEqual(pong.params, { pong: true })
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.live("fails what is waiting when the process stops, with what it last said", () =>
    Effect.gen(function* () {
      const { connection } = yield* connect()
      const failure = yield* Effect.flip(connection.request("die"))
      assert.strictEqual(failure.reason, "Fixture stopped unexpectedly.\nfatal: out of credits")
      const stopped = yield* Effect.flip(connection.stopped)
      assert.strictEqual(stopped.reason, failure.reason)
      const later = yield* Effect.flip(connection.request("echo", {}))
      assert.strictEqual(later.reason, failure.reason)
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )

  it.live("says so when the agent cannot be started", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        connectAcp({
          product: "Fixture",
          executable: "humanity-no-such-agent",
          args: [],
          cwd: process.cwd(),
          env: env(),
          onRequest: () => Effect.succeed(null),
          onNotification: () => Effect.void,
        }),
      )
      assert.include(failure.reason, "Fixture could not be started")
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  )
})
