import type { CodexModel, PlanUsage } from "@humanity/contracts"
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
import { CLI_COMMANDS, CLI_INSTALL_URLS } from "@humanity/contracts"
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
  /** The account Codex would use; `null` when nobody is signed in. */
  readonly account: AccountResponse["account"]
  readonly models: ReadonlyArray<CodexModel>
}

const PROBE_TIMEOUT = "30 seconds"
/** More pages than any account has models for; a guard against a cursor that never ends. */
const MAX_MODEL_PAGES = 10

const decodeAccount = decode(AccountResponse)
const decodeModels = decode(ModelListResponse)
const decodeRateLimits = decode(RateLimitsResponse)

const FIVE_HOURS = 5 * 60
const SEVEN_DAYS = 7 * 24 * 60

/** `43200` minutes → `30-day limit` */
const windowName = (minutes: number): string => {
  const days = minutes / (24 * 60)
  if (Number.isInteger(days)) return `${days}-day limit`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours}-hour limit` : `${minutes}-minute limit`
}

/**
 * Codex's rate-limit windows as Humanity shows a plan's: the five-hour and
 * the weekly one in their places, any other window by its length. `undefined`
 * when Codex reports none (an API key).
 */
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

/**
 * The Codex runtime threads run on: the `codex` the human installed, found
 * on the PATH each time it starts, authenticated by the login in its own folder (the
 * human's `codex login`), exactly like their own terminal sessions.
 */
export class Codex extends Context.Service<
  Codex,
  {
    /** The executable Humanity runs: the installed `codex`, else the bare command. */
    readonly executable: () => string
    /** Where the default login lives: `CODEX_HOME`, else `~/.codex`. */
    readonly home: string
    /**
     * Starts a Codex app server in `cwd` that lives until the scope closes.
     * `codexHome` is the folder of the account it runs as; without it, the
     * default login.
     */
    readonly connect: (options: {
      readonly cwd: string
      readonly codexHome?: string | undefined
      readonly onRequest: (request: ServerMessage) => Effect.Effect<ServerReply, CodexFailed>
    }) => Effect.Effect<AppServer, CodexFailed, Scope.Scope>
    /** Starts Codex just long enough to read an account and its models. Sends nothing to a model. */
    readonly probe: (codexHome?: string) => Effect.Effect<CodexProbe, CodexFailed>
    /**
     * Starts Codex just long enough to read the account's rate-limit windows;
     * `undefined` when the login has none (an API key).
     */
    readonly planUsage: (codexHome?: string) => Effect.Effect<PlanUsage | undefined, CodexFailed>
  }
>()("humanity/Codex") {
  static readonly layer = Layer.effect(
    Codex,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      /**
       * How to start the installed Codex: its native executable when npm put
       * one behind the `codex` launcher, else what the PATH has.
       */
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
                reason: `Codex is not installed: no "codex" command was found. Install it (${CLI_INSTALL_URLS.codex}), then check again.`,
              }),
            )
          }
          return connectAppServer({
            executable: found.command,
            args: found.args,
            // An added account is a Codex folder of its own; the default login is whatever Codex finds.
            env: options.codexHome === undefined ? env : { ...env, CODEX_HOME: options.codexHome },
            cwd: options.cwd,
            onRequest: options.onRequest,
          })
        }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner))

      /** A Codex in Humanity's own data directory, never the user's repository, to ask one thing. */
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
              // A signed-out Codex has no models to offer; asking would only fail.
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
