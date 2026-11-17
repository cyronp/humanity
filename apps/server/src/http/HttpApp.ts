import { HumanityRpcs, RPC_PATH, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import {
  HttpRouter,
  type HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { join } from "node:path"
import { AuthToken } from "../AuthToken.ts"
import { answerMcp, HumanityMcp, MCP_PARSE_ERROR, MCP_PATH } from "../mcp/HumanityMcp.ts"
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

const RpcRoute = HttpRouter.use(
  Effect.fn(function* (router) {
    const token = yield* AuthToken
    const upgrade = yield* RpcServer.toHttpEffectWebsocket(HumanityRpcs)
    yield* router.add("GET", RPC_PATH, (request) =>
      token.matches(queryToken(request)) ? upgrade : Effect.succeed(unauthorized),
    )
  }),
).pipe(Layer.provide(RpcSerialization.layerJson))

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

const McpRoute = HttpRouter.use(
  Effect.fn(function* (router) {
    const mcp = yield* HumanityMcp
    yield* router.add("POST", MCP_PATH, (request) => {
      const tools = mcp.toolsFor(request.headers["authorization"])
      if (tools === undefined) return Effect.succeed(unauthorized)
      return request.text.pipe(
        Effect.flatMap((text) =>
          Effect.try({ try: (): unknown => JSON.parse(text), catch: () => MCP_PARSE_ERROR }).pipe(
            Effect.flatMap((body) => answerMcp(tools, body)),
            Effect.catch((reply) => Effect.succeed(reply)),
          ),
        ),
        Effect.map((reply) =>
          reply.body === undefined
            ? HttpServerResponse.empty({ status: reply.status })
            : HttpServerResponse.jsonUnsafe(reply.body, { status: reply.status }),
        ),
        Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 400 })),
      )
    })
    const postOnly = HttpServerResponse.empty({ status: 405, headers: { allow: "POST" } })
    yield* router.add("GET", MCP_PATH, postOnly)
    yield* router.add("DELETE", MCP_PATH, postOnly)
  }),
)

const ASSETS_CACHE = "public, max-age=31536000, immutable"
const PAGE_CACHE = "no-cache"

export const staticRoutes = (webDist: string) =>
  Layer.mergeAll(
    HttpStaticServer.layer({
      root: join(webDist, "assets"),
      prefix: "/assets",
      cacheControl: ASSETS_CACHE,
    }),
    HttpStaticServer.layer({ root: webDist, spa: true, cacheControl: PAGE_CACHE }),
  )

const StaticRoute = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return config.webDist === undefined
      ? Layer.empty
      : staticRoutes(config.webDist).pipe(Layer.orDie)
  }),
)

export const HttpApp = Layer.mergeAll(RpcRoute, AuthCheckRoute, McpRoute, StaticRoute)
