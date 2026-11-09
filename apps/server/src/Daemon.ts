import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { AuthToken } from "./AuthToken.ts"
import { DatabaseLive } from "./db/Database.ts"
import { HttpApp } from "./http/HttpApp.ts"
import { GitHandlers } from "./rpc/GitHandlers.ts"
import { ProjectsHandlers } from "./rpc/ProjectsHandlers.ts"
import { ServerConfig } from "./ServerConfig.ts"
import { GitService } from "./services/GitService.ts"
import { ProjectService } from "./services/ProjectService.ts"

/** Domain services, built on whatever config, database and platform they are given. */
export const Services = ProjectService.layer.pipe(Layer.provideMerge(GitService.layer))

export const RpcHandlers = Layer.mergeAll(ProjectsHandlers, GitHandlers)

/** Routes plus handlers and services. Still needs config, token, database, platform and an HTTP server. */
export const App = HttpApp.pipe(Layer.provide(RpcHandlers), Layer.provide(Services))

const Banner = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const token = yield* AuthToken
    yield* Effect.logInfo(
      `Humanity daemon listening on http://${config.host}:${config.port} (data: ${config.home})`,
    )
    // Printed with console so the URL stays one clean, clickable line.
    yield* Effect.sync(() =>
      console.log(`\n  Open Humanity:  ${config.webOrigin}/?${TOKEN_PARAM}=${token.value}\n`),
    )
  }),
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port: config.port, host: config.host })
  }),
)

/** The whole daemon as one layer. Needs only a `ServerConfig`. */
export const Daemon = HttpRouter.serve(Layer.merge(App, Banner)).pipe(
  Layer.provide(AuthToken.layer),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServices.layer),
)
