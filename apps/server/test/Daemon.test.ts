import { NodeHttpServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { HumanityRpcs, RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { HttpClient, HttpRouter, HttpServer } from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { AuthToken } from "../src/AuthToken.ts"
import { ClaudeCode } from "../src/claude/ClaudeCode.ts"
import { App } from "../src/Daemon.ts"
import { baseLayer, tempDir, tempRepo } from "./helpers.ts"

/** A Claude Code that reports a Max subscription. Nothing is spawned. */
const ScriptedClaude = ClaudeCode.layerTest(
  Effect.succeed({
    cliVersion: "2.1.321",
    account: { email: "dev@example.com", subscriptionType: "max", apiProvider: "firstParty" },
  }),
)

/** The real routes and handlers on an ephemeral port, over a temp data directory. */
const daemon = (home: string) =>
  HttpRouter.serve(App, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(ScriptedClaude),
    Layer.provideMerge(AuthToken.layer),
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
