import { HumanityRpcs, RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import {
  HttpRouter,
  type HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { AuthToken } from "../AuthToken.ts"
import { ServerConfig } from "../ServerConfig.ts"

const unauthorized = HttpServerResponse.text("Unauthorized: missing or invalid Humanity token.", {
  status: 401,
})

const queryToken = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.url, "http://humanity.local").searchParams.get(TOKEN_PARAM)

const bearerToken = (request: HttpServerRequest.HttpServerRequest) => {
  const header = request.headers["authorization"]
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined
}

/**
 * The RPC WebSocket. Browsers cannot set headers on a WebSocket, so the token
 * travels in the query string and is checked before the upgrade: a connection
 * without a valid token never becomes a socket.
 */
const RpcRoute = HttpRouter.use(
  Effect.fn(function* (router) {
    const token = yield* AuthToken
    const upgrade = yield* RpcServer.toHttpEffectWebsocket(HumanityRpcs)
    yield* router.add("GET", RPC_PATH, (request) =>
      token.matches(queryToken(request)) ? upgrade : Effect.succeed(unauthorized),
    )
  }),
).pipe(Layer.provide(RpcSerialization.layerJson))

/** Lets the web app tell "daemon unreachable" apart from "wrong token" before opening the socket. */
const AuthCheckRoute = HttpRouter.use(
  Effect.fn(function* (router) {
    const token = yield* AuthToken
    yield* router.add("GET", "/api/auth", (request) =>
      Effect.succeed(
        token.matches(bearerToken(request))
          ? HttpServerResponse.jsonUnsafe({ ok: true })
          : unauthorized,
      ),
    )
  }),
)

/** In production the daemon also serves the built web app. */
const StaticRoute = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return config.webDist === undefined
      ? Layer.empty
      : HttpStaticServer.layer({ root: config.webDist, spa: true }).pipe(Layer.orDie)
  }),
)

export const HttpApp = Layer.mergeAll(RpcRoute, AuthCheckRoute, StaticRoute)
