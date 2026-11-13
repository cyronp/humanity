import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { type ClaudeStatus, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { AgentRunnerLive } from "./agent/AgentRunnerLive.ts"
import { AuthToken } from "./AuthToken.ts"
import { ClaudeCode } from "./claude/ClaudeCode.ts"
import { ClaudeHistory } from "./claude/ClaudeHistory.ts"
import { DatabaseLive } from "./db/Database.ts"
import { SessionRepo } from "./db/SessionRepo.ts"
import { HttpApp } from "./http/HttpApp.ts"
import { ApprovalsHandlers } from "./rpc/ApprovalsHandlers.ts"
import { ClaudeHandlers } from "./rpc/ClaudeHandlers.ts"
import { ExtensionsHandlers } from "./rpc/ExtensionsHandlers.ts"
import { GitHandlers } from "./rpc/GitHandlers.ts"
import { GitHubHandlers } from "./rpc/GitHubHandlers.ts"
import { PreferencesHandlers } from "./rpc/PreferencesHandlers.ts"
import { ProjectsHandlers } from "./rpc/ProjectsHandlers.ts"
import { SessionsHandlers } from "./rpc/SessionsHandlers.ts"
import { ServerConfig } from "./ServerConfig.ts"
import { ApprovalService } from "./services/ApprovalService.ts"
import { ClaudeAccountService } from "./services/ClaudeAccountService.ts"
import { ExtensionsService } from "./services/ExtensionsService.ts"
import { GitHubService } from "./services/GitHubService.ts"
import { GitHubToken } from "./services/GitHubToken.ts"
import { GitService } from "./services/GitService.ts"
import { HistoryImport } from "./services/HistoryImport.ts"
import { PreferencesService } from "./services/PreferencesService.ts"
import { ProjectService } from "./services/ProjectService.ts"
import { SessionEvents } from "./services/SessionEvents.ts"
import { SessionService } from "./services/SessionService.ts"

/**
 * Domain services, built on whatever config, database, platform, agent runner,
 * Claude Code runtime and Claude Code history they are given. Tests swap in the fake runner here.
 */
export const Services = Layer.mergeAll(
  Layer.merge(HistoryImport.layer, SessionService.layer).pipe(
    Layer.provideMerge(ApprovalService.layer),
    // What new threads start with, when the human or the project set a default.
    Layer.provideMerge(PreferencesService.layer),
    Layer.provideMerge(ProjectService.layer),
    Layer.provideMerge(GitService.layer),
    Layer.provideMerge(SessionRepo.layer),
    Layer.provideMerge(SessionEvents.layer),
    // Sessions run as one of these accounts.
    Layer.provideMerge(ClaudeAccountService.layer),
    // Humanity's own MCP servers and skills, given to every run.
    Layer.provideMerge(ExtensionsService.layer),
  ),
)

export const RpcHandlers = Layer.mergeAll(
  ProjectsHandlers,
  GitHandlers,
  GitHubHandlers,
  SessionsHandlers,
  ApprovalsHandlers,
  ClaudeHandlers,
  PreferencesHandlers,
  ExtensionsHandlers,
)

/**
 * Routes, handlers and services. Still needs config, auth token, database,
 * platform, agent runner, the Claude Code runtime, GitHub and an HTTP server.
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

/** GitHub over the real network, with a saved token or the one from `gh` or `GITHUB_TOKEN`. */
const GitHubLive = GitHubService.layer.pipe(
  Layer.provide(GitHubToken.layer),
  Layer.provide(FetchHttpClient.layer),
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port: config.port, host: config.host })
  }),
)

/** The whole daemon as one layer. Needs only a `ServerConfig`. */
// No per-request log: the RPC socket URL carries the auth token in its query string.
export const Daemon = HttpRouter.serve(
  Layer.mergeAll(Banner, ClaudeBanner, HistoryImport.background).pipe(Layer.provideMerge(App)),
  { disableLogger: true },
).pipe(
  Layer.provide(AuthToken.layer),
  Layer.provide(AgentRunnerLive),
  // After the runner: both it and the account check run on this Claude Code.
  Layer.provide(ClaudeCode.layer),
  Layer.provide(ClaudeHistory.layer),
  Layer.provide(GitHubLive),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServices.layer),
)
