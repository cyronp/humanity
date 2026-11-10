import { Context, Effect, Layer, Option, Redacted, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

/**
 * Where the GitHub token comes from. It is looked up when needed and never
 * stored: `gh auth token` when the GitHub CLI is logged in, else `GITHUB_TOKEN`.
 */
export class GitHubToken extends Context.Service<
  GitHubToken,
  { readonly get: Effect.Effect<Option.Option<Redacted.Redacted<string>>> }
>()("humanity/GitHubToken") {
  static readonly layer = Layer.effect(
    GitHubToken,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const fromGh = Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make("gh", ["auth", "token"], { extendEnv: true }),
        )
        const [stdout, exitCode] = yield* Effect.all(
          [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
          { concurrency: "unbounded" },
        )
        const token = stdout.trim()
        return Number(exitCode) === 0 && token !== "" ? Option.some(token) : Option.none()
      }).pipe(
        Effect.scoped,
        // No gh installed, or not logged in: fall through to the environment.
        Effect.catch(() => Effect.succeed(Option.none<string>())),
      )

      const fromEnv = Effect.sync(() => {
        const token = process.env["GITHUB_TOKEN"]?.trim()
        return token ? Option.some(token) : Option.none<string>()
      })

      // A login made while the daemon runs is picked up within a minute.
      const get = yield* Effect.cachedWithTTL(
        fromGh.pipe(
          Effect.flatMap((token) => (Option.isSome(token) ? Effect.succeed(token) : fromEnv)),
          Effect.map(Option.map(Redacted.make)),
        ),
        "1 minute",
      )
      return GitHubToken.of({ get })
    }),
  )

  /** A fixed token (or none), for tests. */
  static readonly layerTest = (token: string | undefined) =>
    Layer.succeed(
      GitHubToken,
      GitHubToken.of({
        get: Effect.succeed(
          token === undefined ? Option.none() : Option.some(Redacted.make(token)),
        ),
      }),
    )
}
