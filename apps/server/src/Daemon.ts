import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { type ClaudeStatus, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { AuthToken } from "./AuthToken.ts"
import { ClaudeCode } from "./claude/ClaudeCode.ts"
import { DatabaseLive } from "./db/Database.ts"
import { HttpApp } from "./http/HttpApp.ts"
import { ClaudeHandlers } from "./rpc/ClaudeHandlers.ts"
import { GitHandlers } from "./rpc/GitHandlers.ts"
import { ProjectsHandlers } from "./rpc/ProjectsHandlers.ts"
import { ServerConfig } from "./ServerConfig.ts"
import { ClaudeAccountService } from "./services/ClaudeAccountService.ts"
import { GitService } from "./services/GitService.ts"
import { ProjectService } from "./services/ProjectService.ts"

/** Domain services, built on whatever config, database and platform they are given. */
export const Services = Layer.mergeAll(
  ProjectService.layer.pipe(Layer.provideMerge(GitService.layer)),
  ClaudeAccountService.layer,
)

export const RpcHandlers = Layer.mergeAll(ProjectsHandlers, GitHandlers, ClaudeHandlers)

/**
 * Routes plus handlers and services. Still needs config, token, database,
 * platform, the Claude Code runtime and an HTTP server.
 */
export const App = HttpApp.pipe(Layer.provide(RpcHandlers), Layer.provideMerge(Services))

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

/** One line for the terminal: which Claude account the agent will run as. */
export const describeClaudeForBanner = (status: ClaudeStatus): string => {
  const connection = status.connection
  switch (connection._tag) {
    case "Connected": {
      const who = connection.email === null ? "" : ` (${connection.email})`
      const warning = connection.subscriptionShadowed
        ? " — overrides your Claude subscription; unset it to use your plan"
        : ""
      return `${connection.label}${who}${warning}`
    }
    case "SignedOut":
      return 'not signed in. Run "claude auth login", then open Humanity.'
    case "Unavailable":
      return `unavailable: ${connection.reason.split("\n")[0] ?? ""}`
  }
}

/** Checks the Claude account in the background; the result is the one the UI then reads. */
const ClaudeBanner = Layer.effectDiscard(
  Effect.gen(function* () {
    const account = yield* ClaudeAccountService
    const status = yield* account.status({ refresh: false })
    yield* Effect.sync(() => console.log(`  Claude account: ${describeClaudeForBanner(status)}\n`))
  }).pipe(Effect.forkScoped),
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port: config.port, host: config.host })
  }),
)

/** The whole daemon as one layer. Needs only a `ServerConfig`. */
export const Daemon = HttpRouter.serve(
  Layer.merge(Banner, ClaudeBanner).pipe(Layer.provideMerge(App)),
).pipe(
  Layer.provide(ClaudeCode.layer),
  Layer.provide(AuthToken.layer),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServices.layer),
)
