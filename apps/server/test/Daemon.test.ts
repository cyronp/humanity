import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { HumanityRpcs, RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpRouter, HttpServer } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { AgentRunnerFake, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { AuthToken } from "../src/AuthToken.ts"
import { ClaudeCode } from "../src/claude/ClaudeCode.ts"
import { App } from "../src/Daemon.ts"
import { baseLayer, tempDir, tempRepo } from "./helpers.ts"

/** A Claude Code that reports a Max subscription. Nothing is spawned. */
const ScriptedClaude = ClaudeCode.layerTest(
  Effect.succeed({
    cliVersion: "2.1.321",
    models: [{ value: "default", displayName: "Default (recommended)", description: "" }],
    account: { email: "dev@example.com", subscriptionType: "max", apiProvider: "firstParty" },
  }),
)

/** The real routes and handlers on an ephemeral port, over a temp data directory and a scripted agent. */
const daemon = (home: string, script: FakeScript = () => []) =>
  HttpRouter.serve(App, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(ScriptedClaude),
    Layer.provideMerge(AuthToken.layer),
    Layer.provide(AgentRunnerFake(script)),
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provide(baseLayer(home)),
  )

const rpcUrl = (token: string | undefined) =>
  Effect.gen(function* () {
    const server = yield* HttpServer.HttpServer
    if (server.address._tag === "UnixPathAddress") return yield* Effect.die("expected a TCP port")
    const query = token === undefined ? "" : `?${TOKEN_PARAM}=${encodeURIComponent(token)}`
    return `ws://localhost:${server.address.port}${RPC_PATH}${query}`
  })

/** A client protocol dialing the test daemon with its real token, like the web app does. */
const ClientProtocol = Layer.unwrap(
  Effect.gen(function* () {
    const token = yield* AuthToken
    const url = yield* rpcUrl(token.value)
    return RpcClient.layerProtocolSocket().pipe(
      Layer.provide(Socket.layerWebSocket(url)),
      Layer.provide(Socket.layerWebSocketConstructorGlobal),
      Layer.provide(RpcSerialization.layerJson),
    )
  }),
)

/** Resolves with how a raw WebSocket handshake ended. */
const handshake = (url: string) =>
  Effect.callback<"open" | "rejected">((resume) => {
    const socket = new WebSocket(url)
    socket.addEventListener("open", () => {
      socket.close()
      resume(Effect.succeed("open"))
    })
    socket.addEventListener("error", () => resume(Effect.succeed("rejected")))
  })

describe("daemon", () => {
  it.live("serves RPCs over a WebSocket opened with the token", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(HumanityRpcs, { flatten: true })

        assert.deepStrictEqual(yield* client("Projects.list", undefined), [])

        const project = yield* client("Projects.addLocal", { path: repo })
        assert.strictEqual(project.defaultBranch, "main")
        assert.deepStrictEqual(yield* client("Projects.list", undefined), [project])

        // Tagged errors cross the wire intact.
        const error = yield* Effect.flip(client("Projects.addLocal", { path: repo }))
        assert.strictEqual(error._tag, "ProjectAlreadyExists")
      }).pipe(Effect.provide(ClientProtocol.pipe(Layer.provideMerge(daemon(home)))))
    }),
  )

  it.live("streams a session's events over the socket", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo()

      yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(HumanityRpcs, { flatten: true })
        const project = yield* client("Projects.addLocal", { path: repo })
        const session = yield* client("Sessions.create", {
          projectId: project.id,
          prompt: "Summarize the repo",
        })

        const events = yield* client("Sessions.subscribe", { sessionId: session.id }).pipe(
          Stream.takeUntil(
            (event) =>
              (event._tag === "SessionStatusChanged" && event.status === "idle") ||
              (event._tag === "Snapshot" && event.session.status === "idle"),
          ),
          Stream.runCollect,
        )
        assert.strictEqual(events[0]?._tag, "Snapshot")

        const after = yield* client("Sessions.subscribe", { sessionId: session.id }).pipe(
          Stream.take(1),
          Stream.runCollect,
        )
        const snapshot = after[0]
        assert.strictEqual(snapshot?._tag, "Snapshot")
        if (snapshot?._tag === "Snapshot") {
          assert.deepStrictEqual(
            snapshot.messages.map((message) => message.content._tag),
            ["user", "system_init", "assistant", "tool_results", "assistant", "result"],
          )
          assert.deepStrictEqual(snapshot.toolCalls[0]?.input, { pattern: "**/*.md" })
        }

        const missing = yield* Effect.flip(client("Sessions.get", { sessionId: "nope" as never }))
        assert.strictEqual(missing._tag, "SessionNotFound")
      }).pipe(
        Effect.provide(
          ClientProtocol.pipe(
            Layer.provideMerge(
              daemon(home, () => [
                { tool: "Glob", input: { pattern: "**/*.md" }, output: "README.md" },
                { text: "One README." },
              ]),
            ),
          ),
        ),
      )
    }),
  )

  it.live("reviews a change over the socket, end to end", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo({ "app.ts": "const a = 1\nconst b = 2\n" })

      yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(HumanityRpcs, { flatten: true })
        const project = yield* client("Projects.addLocal", { path: repo })
        const session = yield* client("Sessions.create", { projectId: project.id, prompt: "edit" })

        const requested = yield* client("Sessions.subscribe", { sessionId: session.id }).pipe(
          Stream.filter((event) => event._tag === "ApprovalRequested"),
          Stream.take(1),
          Stream.runCollect,
        )
        const event = requested[0]
        if (event?._tag !== "ApprovalRequested" || event.approval._tag !== "change") {
          return assert.fail("expected a change to review")
        }
        const pending = yield* client("Approvals.listPending", { sessionId: session.id })
        assert.lengthOf(pending, 1)

        const resolved = yield* client("Approvals.decideChange", {
          changeId: event.approval.change.id,
          decisions: [{ index: 1, decision: "rejected", comment: "keep b" }],
        })
        assert.strictEqual(resolved.status, "rejected")
        assert.strictEqual(resolved.hunks[0]?.comment, "keep b")

        const again = yield* Effect.flip(
          client("Approvals.decideChange", {
            changeId: event.approval.change.id,
            decisions: [{ index: 1, decision: "approved" }],
          }),
        )
        assert.strictEqual(again._tag, "ApprovalAlreadyDecided")

        const history = yield* client("Approvals.history", { projectId: project.id })
        assert.lengthOf(history, 1)
        assert.strictEqual(history[0]?.sessionTitle, "edit")
        assert.strictEqual(history[0]?.sessionBranch, session.branch)
        assert.strictEqual(
          history[0]?.approval._tag === "change" ? history[0].approval.change.status : "",
          "rejected",
        )

        const policy = yield* client("Projects.getPolicy", { projectId: project.id })
        const saved = yield* client("Projects.setPolicy", {
          projectId: project.id,
          policy: { rules: [...policy.rules, { pattern: "mcp__docs__*", mode: "auto" }] },
        })
        assert.deepStrictEqual(saved.rules.at(-1), { pattern: "mcp__docs__*", mode: "auto" })
      }).pipe(
        Effect.provide(
          ClientProtocol.pipe(
            Layer.provideMerge(
              daemon(home, () => [
                {
                  tool: "Edit",
                  input: { file_path: "app.ts", old_string: "b = 2", new_string: "b = 3" },
                },
              ]),
            ),
          ),
        ),
      )
    }),
  )

  it.live("reports the Claude account the agent will run as", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()

      yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(HumanityRpcs, { flatten: true })
        const status = yield* client("Claude.status", { refresh: false })
        assert.strictEqual(status.cliVersion, "2.1.321")
        assert.deepStrictEqual(status.connection, {
          _tag: "Connected",
          method: "subscription",
          label: "Claude Max",
          email: "dev@example.com",
          organization: null,
          subscriptionShadowed: false,
        })
      }).pipe(Effect.provide(ClientProtocol.pipe(Layer.provideMerge(daemon(home)))))
    }),
  )

  it.live("rejects WebSocket connections without a valid token", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()

      yield* Effect.gen(function* () {
        const token = yield* AuthToken

        assert.strictEqual(yield* handshake(yield* rpcUrl(undefined)), "rejected")
        assert.strictEqual(yield* handshake(yield* rpcUrl("not-the-token")), "rejected")
        assert.strictEqual(yield* handshake(yield* rpcUrl(token.value)), "open")

        const http = yield* HttpClient.HttpClient
        const noToken = yield* http.get(RPC_PATH)
        assert.strictEqual(noToken.status, 401)
      }).pipe(Effect.provide(daemon(home)))
    }),
  )

  it.live("answers the auth check for the web app", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()

      yield* Effect.gen(function* () {
        const token = yield* AuthToken
        const http = yield* HttpClient.HttpClient

        const ok = yield* http.get("/api/auth", {
          headers: { authorization: `Bearer ${token.value}` },
        })
        assert.strictEqual(ok.status, 200)

        const wrong = yield* http.get("/api/auth", { headers: { authorization: "Bearer nope" } })
        assert.strictEqual(wrong.status, 401)
      }).pipe(Effect.provide(daemon(home)))
    }),
  )

  it.live("reuses the same token after a restart", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const read = AuthToken.use((token) => Effect.succeed(token.value)).pipe(
        Effect.provide(AuthToken.layer.pipe(Layer.provide(baseLayer(home)))),
      )
      const first = yield* read
      const second = yield* read
      assert.isTrue(first.length >= 32)
      assert.strictEqual(first, second)
    }),
  )
})
