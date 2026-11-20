import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { HumanityRpcs, RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Exit, Layer, Scope, Stream } from "effect"
import { HttpBody, HttpClient, HttpRouter, HttpServer } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { AgentRunnerFake, type FakeScript } from "../src/agent/AgentRunnerFake.ts"
import { AuthToken } from "../src/AuthToken.ts"
import { ClaudeCode } from "../src/claude/ClaudeCode.ts"
import { ClaudeHistory } from "../src/claude/ClaudeHistory.ts"
import { Codex } from "../src/codex/Codex.ts"
import { Antigravity } from "../src/antigravity/Antigravity.ts"
import { Kiro } from "../src/kiro/Kiro.ts"
import { HumanityMcp } from "../src/mcp/HumanityMcp.ts"
import { App } from "../src/Daemon.ts"
import { makeFakePtyHost } from "../src/terminal/PtyHost.ts"
import { baseLayer, tempDir, tempRepo } from "./helpers.ts"

const ScriptedClaude = ClaudeCode.layerTest(
  Effect.succeed({
    cliVersion: "2.1.321",
    models: [{ value: "default", displayName: "Default (recommended)", description: "" }],
    account: { email: "dev@example.com", subscriptionType: "max", apiProvider: "firstParty" },
  }),
)

const daemon = (home: string, script: FakeScript = () => []) =>
  HttpRouter.serve(App, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(ScriptedClaude),
    Layer.provide(Codex.layerTest()),
    Layer.provide(Kiro.layerTest()),
    Layer.provide(Antigravity.layerTest()),
    Layer.provide(ClaudeHistory.layerTest()),
    Layer.provideMerge(AuthToken.layer),
    Layer.provide(AgentRunnerFake(script)),
    Layer.provide(makeFakePtyHost().layer),
    Layer.provideMerge(HumanityMcp.layer),
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

  it.live("answers a file change over the socket, end to end", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()
      const repo = yield* tempRepo({ "app.ts": "const a = 1\nconst b = 2\n" })

      yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(HumanityRpcs, { flatten: true })
        const project = yield* client("Projects.addLocal", { path: repo })
        assert.isNull(project.defaultAutonomy)
        const session = yield* client("Sessions.create", {
          projectId: project.id,
          prompt: "edit",
          autonomy: "ask",
        })

        const requested = yield* client("Sessions.subscribe", { sessionId: session.id }).pipe(
          Stream.filter((event) => event._tag === "ApprovalRequested"),
          Stream.take(1),
          Stream.runCollect,
        )
        const event = requested[0]
        if (event?._tag !== "ApprovalRequested" || event.approval._tag !== "change") {
          return assert.fail("expected a change to answer")
        }
        const pending = yield* client("Approvals.listPending", { sessionId: session.id })
        assert.lengthOf(pending, 1)

        const resolved = yield* client("Approvals.decideChange", {
          changeId: event.approval.change.id,
          decision: "deny",
          comment: "keep b",
        })
        assert.strictEqual(resolved.status, "rejected")
        assert.strictEqual(resolved.comment, "keep b")

        const again = yield* Effect.flip(
          client("Approvals.decideChange", {
            changeId: event.approval.change.id,
            decision: "allow",
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

        const saved = yield* client("Projects.setDefaultAutonomy", {
          projectId: project.id,
          autonomy: "ask",
        })
        assert.strictEqual(saved.defaultAutonomy, "ask")
        const next = yield* client("Sessions.create", { projectId: project.id })
        assert.strictEqual(next.autonomy, "ask")
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

  it.live("serves Humanity's MCP server to the agent of a running thread, and to no one else", () =>
    Effect.gen(function* () {
      const home = yield* tempDir()

      yield* Effect.gen(function* () {
        const http = yield* HttpClient.HttpClient
        const token = yield* AuthToken
        const mcp = yield* HumanityMcp
        const post = (authorization: string | undefined, body: string) =>
          http.post("/mcp", {
            headers: {
              ...(authorization === undefined ? {} : { authorization }),
              accept: "application/json, text/event-stream",
            },
            body: HttpBody.text(body, "application/json"),
          })
        const list = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })

        assert.strictEqual((yield* post(undefined, list)).status, 401)
        assert.strictEqual((yield* post(`Bearer ${token.value}`, list)).status, 401)

        const scope = yield* Scope.make()
        const server = yield* mcp
          .serve({
            openThread: () => Effect.die("not called"),
            terminal: () => Effect.die("not called"),
          })
          .pipe(Scope.provide(scope))
        const authorization = server.type === "http" ? server.headers["Authorization"] : undefined

        const listed = yield* post(authorization, list)
        assert.strictEqual(listed.status, 200)
        assert.include(listed.headers["content-type"], "application/json")
        const body = (yield* listed.json) as { result: { tools: ReadonlyArray<{ name: string }> } }
        assert.deepStrictEqual(
          body.result.tools.map((tool) => tool.name),
          [
            "open_thread",
            "terminal_list",
            "terminal_read",
            "terminal_send",
            "terminal_wait",
            "terminal_open",
            "terminal_close",
          ],
        )
        const notified = yield* post(
          authorization,
          JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        )
        assert.strictEqual(notified.status, 202)
        assert.strictEqual((yield* post(authorization, "{not json")).status, 400)
        const stream = yield* http.get("/mcp", { headers: { authorization: authorization ?? "" } })
        assert.strictEqual(stream.status, 405)

        yield* Scope.close(scope, Exit.void)
        assert.strictEqual((yield* post(authorization, list)).status, 401)
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
