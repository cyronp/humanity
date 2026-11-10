import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { AgentRunnerLive } from "./agent/AgentRunnerLive.ts"
import { AuthToken } from "./AuthToken.ts"
import { DatabaseLive } from "./db/Database.ts"
import { SessionRepo } from "./db/SessionRepo.ts"
import { HttpApp } from "./http/HttpApp.ts"
import { GitHandlers } from "./rpc/GitHandlers.ts"
import { ProjectsHandlers } from "./rpc/ProjectsHandlers.ts"
import { SessionsHandlers } from "./rpc/SessionsHandlers.ts"
import { ServerConfig } from "./ServerConfig.ts"
import { GitService } from "./services/GitService.ts"
import { ProjectService } from "./services/ProjectService.ts"
import { SessionEvents } from "./services/SessionEvents.ts"
import { SessionService } from "./services/SessionService.ts"

/**
 * Domain services, built on whatever config, database, platform and agent
 * runner they are given. Tests swap in the fake runner here.
 */
export const Services = SessionService.layer.pipe(
  Layer.provideMerge(ProjectService.layer),
  Layer.provideMerge(GitService.layer),
  Layer.provideMerge(SessionRepo.layer),
  Layer.provideMerge(SessionEvents.layer),
)

export const RpcHandlers = Layer.mergeAll(ProjectsHandlers, GitHandlers, SessionsHandlers)

/** Routes, handlers and services. Still needs config, token, database, platform, agent runner and an HTTP server. */
export const App = HttpApp.pipe(Layer.provide(RpcHandlers), Layer.provide(Services))

const Banner = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const token = yield* AuthToken
    if (!process.env["ANTHROPIC_API_KEY"]) {
      yield* Effect.logWarning(
        "ANTHROPIC_API_KEY is not set. Agent sessions will fail to start until it is exported.",
      )
    }
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
  Layer.provide(AgentRunnerLive),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServices.layer),
)
