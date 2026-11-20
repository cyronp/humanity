import {
  type AgentCli,
  type AgentCliUpdate,
  type AgentProvider,
  CLI_COMMANDS,
  CLI_INSTALL_URLS,
  CLI_MINIMUM_VERSIONS,
  CliNotInstalled,
  CliUpdateFailed,
  PROVIDER_NAMES,
} from "@humanity/contracts"
import { Context, Effect, Layer, Semaphore, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { type CliLaunch, isOutdated, locateCli, parseCliVersion } from "../agent/installedCli.ts"

const VERSION_TIMEOUT = "15 seconds"
const UPDATE_TIMEOUT = "10 minutes"

const QUIET_ENV: Readonly<Partial<Record<AgentProvider, Readonly<Record<string, string>>>>> = {
  antigravity: { AGY_CLI_DISABLE_AUTO_UPDATE: "1" },
}

interface Ran {
  readonly output: string
  readonly exitCode: number
}

export class AgentCliService extends Context.Service<
  AgentCliService,
  {
    readonly locate: (provider: AgentProvider) => CliLaunch | undefined
    readonly status: (provider: AgentProvider) => Effect.Effect<AgentCli>
    readonly update: (
      provider: AgentProvider,
    ) => Effect.Effect<AgentCliUpdate, CliNotInstalled | CliUpdateFailed>
  }
>()("humanity/AgentCliService") {
  static readonly layer = Layer.effect(
    AgentCliService,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const locate = (provider: AgentProvider) => locateCli(CLI_COMMANDS[provider])

      const updates = new Map<AgentProvider, Semaphore.Semaphore>()
      const updateLock = (provider: AgentProvider) => {
        const existing = updates.get(provider)
        if (existing !== undefined) return existing
        const created = Semaphore.makeUnsafe(1)
        updates.set(provider, created)
        return created
      }

      const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
        stream.pipe(Stream.decodeText(), Stream.mkString)

      const run = (
        launch: CliLaunch,
        args: ReadonlyArray<string>,
        env?: Readonly<Record<string, string>>,
      ) =>
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make(launch.command, [...launch.args, ...args], {
              extendEnv: true,
              ...(env === undefined ? {} : { env: { ...env } }),
              stdin: "ignore",
            }),
          )
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
            { concurrency: "unbounded" },
          )
          return { output: `${stdout}${stderr}`, exitCode: Number(exitCode) } satisfies Ran
        }).pipe(Effect.scoped)

      const updateCommand = (provider: AgentProvider) => `${CLI_COMMANDS[provider]} update`

      const status = (provider: AgentProvider) =>
        Effect.gen(function* () {
          const launch = locate(provider)
          const minimumVersion = CLI_MINIMUM_VERSIONS[provider]
          const version =
            launch === undefined
              ? null
              : yield* run(launch, ["--version"], QUIET_ENV[provider]).pipe(
                  Effect.map((ran) => parseCliVersion(ran.output) ?? null),
                  Effect.timeoutOrElse({
                    duration: VERSION_TIMEOUT,
                    orElse: () => Effect.succeed(null),
                  }),
                  Effect.catchCause(() => Effect.succeed(null)),
                )
          return {
            provider,
            path: launch?.path ?? null,
            version,
            minimumVersion,
            outdated: isOutdated(version, minimumVersion),
            updateCommand: updateCommand(provider),
            installUrl: CLI_INSTALL_URLS[provider],
          } satisfies AgentCli
        }).pipe(Effect.withSpan("AgentCliService.status", { attributes: { provider } }))

      const runUpdate = Effect.fnUntraced(function* (provider: AgentProvider) {
        const product = PROVIDER_NAMES[provider]
        const command = updateCommand(provider)
        const launch = locate(provider)
        if (launch === undefined) {
          return yield* new CliNotInstalled({
            product,
            command: CLI_COMMANDS[provider],
            installUrl: CLI_INSTALL_URLS[provider],
          })
        }
        yield* Effect.logInfo(`Updating ${product}`, launch.path)
        const ran = yield* run(launch, ["update"]).pipe(
          Effect.mapError(
            (cause) => new CliUpdateFailed({ product, command, output: String(cause) }),
          ),
          Effect.timeoutOrElse({
            duration: UPDATE_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new CliUpdateFailed({
                  product,
                  command,
                  output: `It did not finish within ${UPDATE_TIMEOUT}.`,
                }),
              ),
          }),
        )
        if (ran.exitCode !== 0) {
          return yield* new CliUpdateFailed({ product, command, output: ran.output })
        }
        return { output: ran.output, cli: yield* status(provider) } satisfies AgentCliUpdate
      })

      const update = (provider: AgentProvider) =>
        updateLock(provider)
          .withPermits(1)(runUpdate(provider))
          .pipe(Effect.withSpan("AgentCliService.update", { attributes: { provider } }))

      return { locate, status, update }
    }),
  )
}
