import { type CodexModel, isReasoningEffort, type PlanUsage } from "@humanity/contracts"
import { Context, Effect, Layer, Option, type Scope } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { homedir } from "node:os"
import { join } from "node:path"
import { ServerConfig } from "../ServerConfig.ts"
import {
  type AppServer,
  CodexFailed,
  connectAppServer,
  type ServerMessage,
  type ServerReply,
} from "./AppServer.ts"
import { CLI_COMMANDS, CLI_INSTALL_URLS, CliNotInstalled } from "@humanity/contracts"
import { locateCli } from "../agent/installedCli.ts"
import { codexEnvironment, codexNativeExecutable } from "./environment.ts"
import {
  AccountResponse,
  decode,
  ModelListResponse,
  RateLimitsResponse,
  type RateLimitWindow,
} from "./protocol.ts"

export interface CodexProbe {
  readonly cliVersion: string | undefined
  readonly codexHome: string | undefined
  readonly account: AccountResponse["account"]
  readonly models: ReadonlyArray<CodexModel>
}

const PROBE_TIMEOUT = "30 seconds"
const MAX_MODEL_PAGES = 10

const decodeAccount = decode(AccountResponse)
const decodeModels = decode(ModelListResponse)
const decodeRateLimits = decode(RateLimitsResponse)

const codexEfforts = (
  supported: ReadonlyArray<{ readonly reasoningEffort: string }> | null | undefined,
): Pick<CodexModel, "efforts"> =>
  supported === undefined || supported === null
    ? {}
    : { efforts: supported.map((option) => option.reasoningEffort).filter(isReasoningEffort) }

const FIVE_HOURS = 5 * 60
const SEVEN_DAYS = 7 * 24 * 60

const windowName = (minutes: number): string => {
  const days = minutes / (24 * 60)
  if (Number.isInteger(days)) return `${days}-day limit`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}-hour limit` : `${minutes}-minute limit`
}

export const codexPlanUsage = (limits: RateLimitsResponse): PlanUsage | undefined => {
  const windows = [limits.rateLimits.primary, limits.rateLimits.secondary].filter(
    (window): window is RateLimitWindow => window !== null && window !== undefined,
  )
  if (windows.length === 0) return undefined
  const usage: {
    fiveHour: PlanUsage["fiveHour"]
    sevenDay: PlanUsage["sevenDay"]
    models: Array<PlanUsage["models"][number]>
  } = { fiveHour: null, sevenDay: null, models: [] }
  for (const window of windows) {
    const shown = {
      utilization: window.usedPercent,
      resetsAt:
        typeof window.resetsAt === "number" ? new Date(window.resetsAt * 1000).toISOString() : null,
    }
    const minutes = window.windowDurationMins ?? null
    if (minutes === FIVE_HOURS && usage.fiveHour === null) usage.fiveHour = shown
    else if (minutes === SEVEN_DAYS && usage.sevenDay === null) usage.sevenDay = shown
    else if (minutes === null && usage.fiveHour === null) usage.fiveHour = shown
    else if (minutes === null && usage.sevenDay === null) usage.sevenDay = shown
    else usage.models.push({ name: minutes === null ? "Limit" : windowName(minutes), ...shown })
  }
  return usage
}

export const readCodexPlanUsage = (server: AppServer) =>
  server
    .request("account/rateLimits/read")
    .pipe(
      Effect.map((response) =>
        Option.getOrUndefined(Option.map(decodeRateLimits(response), codexPlanUsage)),
      ),
    )

const refuse = (request: ServerMessage) =>
  Effect.fail(new CodexFailed({ reason: `Humanity does not answer ${request.method} here.` }))

const withTimeout = <A>(effect: Effect.Effect<A, CodexFailed>) =>
  effect.pipe(
    Effect.timeoutOrElse({
      duration: PROBE_TIMEOUT,
      orElse: () =>
        Effect.fail(new CodexFailed({ reason: `Codex did not answer within ${PROBE_TIMEOUT}.` })),
    }),
  )

export class Codex extends Context.Service<
  Codex,
  {
    readonly executable: () => string
    readonly home: string
    readonly connect: (options: {
      readonly cwd: string
      readonly codexHome?: string | undefined
      readonly onRequest: (request: ServerMessage) => Effect.Effect<ServerReply, CodexFailed>
    }) => Effect.Effect<AppServer, CodexFailed, Scope.Scope>
    readonly probe: (codexHome?: string) => Effect.Effect<CodexProbe, CodexFailed>
    readonly planUsage: (codexHome?: string) => Effect.Effect<PlanUsage | undefined, CodexFailed>
  }
>()("humanity/Codex") {
  static readonly layer = Layer.effect(
    Codex,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const launch = () => {
        const found = locateCli(CLI_COMMANDS.codex)
        if (found === undefined) return undefined
        if (found.script === undefined)
          return { path: found.path, command: found.command, args: [] }
        const native = codexNativeExecutable(found.script)
        return native === undefined
          ? { path: found.path, command: found.command, args: found.args }
          : { path: native, command: native, args: [] }
      }
      const executable = () => launch()?.path ?? CLI_COMMANDS.codex
      const env = codexEnvironment(process.env)

      const home = env["CODEX_HOME"] ?? join(homedir(), ".codex")

      const connect = (options: {
        readonly cwd: string
        readonly codexHome?: string | undefined
        readonly onRequest: (request: ServerMessage) => Effect.Effect<ServerReply, CodexFailed>
      }) =>
        Effect.suspend(() => {
          const found = launch()
          if (found === undefined) {
            return Effect.fail(
              new CodexFailed({
                reason: new CliNotInstalled({
                  product: "Codex",
                  command: CLI_COMMANDS.codex,
                  installUrl: CLI_INSTALL_URLS.codex,
                }).message,
              }),
            )
          }
          return connectAppServer({
            executable: found.command,
            args: found.args,
            env: options.codexHome === undefined ? env : { ...env, CODEX_HOME: options.codexHome },
            cwd: options.cwd,
            onRequest: options.onRequest,
          })
        }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

      const idle = <A>(
        codexHome: string | undefined,
        ask: (server: AppServer) => Effect.Effect<A, CodexFailed>,
      ) =>
        connect({ cwd: config.home, codexHome, onRequest: refuse }).pipe(
          Effect.flatMap(ask),
          Effect.scoped,
          withTimeout,
        )

      const models = (server: AppServer) =>
        Effect.gen(function* () {
          const found: Array<CodexModel> = []
          let cursor: string | null = null
          for (let page = 0; page < MAX_MODEL_PAGES; page++) {
            const response = decodeModels(
              yield* server.request("model/list", cursor === null ? {} : { cursor }),
            )
            if (Option.isNone(response)) break
            for (const model of response.value.data) {
              if (model.hidden === true) continue
              found.push({
                value: model.model,
                displayName: model.displayName,
                description: model.description ?? "",
                isDefault: model.isDefault === true,
                ...codexEfforts(model.supportedReasoningEfforts),
              })
            }
            cursor = response.value.nextCursor ?? null
            if (cursor === null) break
          }
          return found
        })

      const probe = (codexHome?: string) =>
        idle(codexHome, (server) =>
          Effect.gen(function* () {
            const account = decodeAccount(
              yield* server.request("account/read", { refreshToken: false }),
            )
            return {
              cliVersion: server.cliVersion,
              codexHome: server.codexHome,
              account: Option.isSome(account) ? account.value.account : null,
              models: yield* models(server).pipe(Effect.orElseSucceed(() => [])),
            } satisfies CodexProbe
          }),
        )

      return {
        executable,
        home,
        connect,
        probe,
        planUsage: (codexHome) => idle(codexHome, readCodexPlanUsage),
      }
    }),
  )

  static readonly layerTest = (
    options: {
      readonly probe?: (codexHome?: string) => Effect.Effect<CodexProbe, CodexFailed>
      readonly planUsage?: (codexHome?: string) => Effect.Effect<PlanUsage | undefined, CodexFailed>
    } = {},
  ) => {
    const unused = new CodexFailed({ reason: "Codex is not used by this test." })
    return Layer.succeed(Codex, {
      executable: () => "codex",
      home: "/home/me/.codex",
      connect: () => Effect.fail(unused),
      probe: options.probe ?? (() => Effect.fail(unused)),
      planUsage: options.planUsage ?? (() => Effect.succeed(undefined)),
    })
  }
}
