import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { type ClaudeStatus, TOKEN_PARAM } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { createServer } from "node:http"
import { AgentRunnerLive } from "./agent/AgentRunnerLive.ts"
import { AuthToken } from "./AuthToken.ts"
import { ClaudeCode } from "./claude/ClaudeCode.ts"
import { ClaudeHistory } from "./claude/ClaudeHistory.ts"
import { Codex } from "./codex/Codex.ts"
import { Kiro } from "./kiro/Kiro.ts"
import { DatabaseLive } from "./db/Database.ts"
import { SessionRepo } from "./db/SessionRepo.ts"
import { HttpApp } from "./http/HttpApp.ts"
import { HumanityMcp } from "./mcp/HumanityMcp.ts"
import { AgentClisHandlers } from "./rpc/AgentClisHandlers.ts"
import { ApprovalsHandlers } from "./rpc/ApprovalsHandlers.ts"
import { ClaudeHandlers } from "./rpc/ClaudeHandlers.ts"
import { CodexHandlers } from "./rpc/CodexHandlers.ts"
import { KiroHandlers } from "./rpc/KiroHandlers.ts"
import { ExtensionsHandlers } from "./rpc/ExtensionsHandlers.ts"
import { GitHandlers } from "./rpc/GitHandlers.ts"
import { GitHubHandlers } from "./rpc/GitHubHandlers.ts"
import { GitLabHandlers } from "./rpc/GitLabHandlers.ts"
import { PreferencesHandlers } from "./rpc/PreferencesHandlers.ts"
import { ProjectsHandlers } from "./rpc/ProjectsHandlers.ts"
import { PullRequestsHandlers } from "./rpc/PullRequestsHandlers.ts"
import { SessionsHandlers } from "./rpc/SessionsHandlers.ts"
import { UpdatesHandlers } from "./rpc/UpdatesHandlers.ts"
import { ServerConfig } from "./ServerConfig.ts"
import { AgentCliService } from "./services/AgentCliService.ts"
import { ApprovalService } from "./services/ApprovalService.ts"
import { ClaudeAccountService } from "./services/ClaudeAccountService.ts"
import { CodexAccountService } from "./services/CodexAccountService.ts"
import { KiroAccountService } from "./services/KiroAccountService.ts"
import { ExtensionsService } from "./services/ExtensionsService.ts"
import { ForgeSync } from "./services/ForgeSync.ts"
import { GitHubService } from "./services/GitHubService.ts"
import { GitHubToken } from "./services/GitHubToken.ts"
import { GitLabService } from "./services/GitLabService.ts"
import { GitLabToken } from "./services/GitLabToken.ts"
import { FileSearchService } from "./services/FileSearchService.ts"
import { GitService } from "./services/GitService.ts"
import { HistoryImport } from "./services/HistoryImport.ts"
import { PreferencesService } from "./services/PreferencesService.ts"
import { ProjectService } from "./services/ProjectService.ts"
import { PullRequestService } from "./services/PullRequestService.ts"
import { SessionEvents } from "./services/SessionEvents.ts"
import { SessionService } from "./services/SessionService.ts"
import { UpdateService } from "./services/UpdateService.ts"

export const Services = Layer.mergeAll(
  Layer.mergeAll(HistoryImport.layer, PullRequestService.layer, UpdateService.layer).pipe(
    Layer.provideMerge(ForgeSync.layer),
    Layer.provideMerge(SessionService.layer),
    Layer.provideMerge(ApprovalService.layer),
    Layer.provideMerge(PreferencesService.layer),
    Layer.provideMerge(ProjectService.layer),
    Layer.provideMerge(FileSearchService.layer),
    Layer.provideMerge(GitService.layer),
    Layer.provideMerge(SessionRepo.layer),
    Layer.provideMerge(SessionEvents.layer),
    Layer.provideMerge(ClaudeAccountService.layer),
    Layer.provideMerge(CodexAccountService.layer),
    Layer.provideMerge(KiroAccountService.layer),
    Layer.provideMerge(ExtensionsService.layer),
    Layer.provideMerge(AgentCliService.layer),
  ),
)

export const RpcHandlers = Layer.mergeAll(
  ProjectsHandlers,
  GitHandlers,
  GitHubHandlers,
  GitLabHandlers,
  SessionsHandlers,
  ApprovalsHandlers,
  ClaudeHandlers,
  CodexHandlers,
  KiroHandlers,
  PreferencesHandlers,
  ExtensionsHandlers,
  PullRequestsHandlers,
  UpdatesHandlers,
  AgentClisHandlers,
)

export const App = HttpApp.pipe(Layer.provide(RpcHandlers), Layer.provideMerge(Services))

const Banner = Layer.effectDiscard(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    const token = yield* AuthToken
    yield* Effect.logInfo(
      `Humanity daemon listening on http://${config.host}:${config.port} (data: ${config.home})`,
    )
    yield* Effect.sync(() =>
      console.log(`\n  Open Humanity:  ${config.webOrigin}/?${TOKEN_PARAM}=${token.value}\n`),
    )
  }),
)

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

const ClaudeBanner = Layer.effectDiscard(
  Effect.gen(function* () {
    const account = yield* ClaudeAccountService
    const status = yield* account.status({ refresh: false })
    yield* Effect.sync(() => console.log(`  Claude account: ${describeClaudeForBanner(status)}\n`))
  }).pipe(Effect.forkScoped),
)

const GitHubLive = GitHubService.layer.pipe(
  Layer.provide(GitHubToken.layer),
  Layer.provide(FetchHttpClient.layer),
)

const GitLabLive = GitLabService.layer.pipe(
  Layer.provide(GitLabToken.layer),
  Layer.provide(FetchHttpClient.layer),
)

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig
    return NodeHttpServer.layer(createServer, { port: config.port, host: config.host })
  }),
)

export const Daemon = HttpRouter.serve(
  Layer.mergeAll(Banner, ClaudeBanner, HistoryImport.background).pipe(Layer.provideMerge(App)),
  { disableLogger: true },
).pipe(
  Layer.provide(AuthToken.layer),
  Layer.provide(AgentRunnerLive),
  Layer.provide(HumanityMcp.layer),
  Layer.provide(ClaudeCode.layer),
  Layer.provide(Codex.layer),
  Layer.provide(Kiro.layer),
  Layer.provide(ClaudeHistory.layer),
  Layer.provide(GitHubLive),
  Layer.provide(GitLabLive),
  Layer.provide(HttpServerLive),
  Layer.provide(DatabaseLive),
  Layer.provide(NodeServices.layer),
)
