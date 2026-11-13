import type { GitHubTokenSource } from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Option, Redacted, Ref, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { ServerConfig } from "../ServerConfig.ts"

/** The token GitHub is called with, and where it was found. */
export interface ResolvedGitHubToken {
  readonly token: Option.Option<Redacted.Redacted<string>>
  /** `null` when there is no token. */
  readonly source: GitHubTokenSource | null
  /** Whether the `gh` command exists, signed in or not. */
  readonly cliInstalled: boolean
}

/**
 * Where the GitHub token comes from. A token the human saved from the UI is
 * tried first; it lives in a file of its own under the data directory, never
 * in the database. Without one it is `gh auth token` when the GitHub CLI is
 * logged in, else `GITHUB_TOKEN`; those two are looked up, never stored.
 */
export class GitHubToken extends Context.Service<
  GitHubToken,
  {
    readonly get: Effect.Effect<Option.Option<Redacted.Redacted<string>>>
    readonly resolve: Effect.Effect<ResolvedGitHubToken>
    /** Looks everything up again on the next `get` or `resolve`. */
    readonly invalidate: Effect.Effect<void>
    /** Saves a token; it is used from the next lookup on. */
    readonly save: (token: Redacted.Redacted<string>) => Effect.Effect<void>
    readonly clear: Effect.Effect<void>
  }
>()("humanity/GitHubToken") {
  static readonly layer = Layer.effect(
    GitHubToken,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const fs = yield* FileSystem.FileSystem
      const config = yield* ServerConfig

      const fromFile = fs.readFileString(config.githubTokenPath).pipe(
        Effect.map((text) => {
          const token = text.trim()
          return token === "" ? Option.none<string>() : Option.some(token)
        }),
        // No file: no token was saved.
        Effect.catch(() => Effect.succeed(Option.none<string>())),
      )

      const fromGh = Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make("gh", ["auth", "token"], { extendEnv: true }),
        )
        const [stdout, exitCode] = yield* Effect.all(
          [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
          { concurrency: "unbounded" },
        )
        const token = stdout.trim()
        return {
          installed: true,
          token:
            Number(exitCode) === 0 && token !== "" ? Option.some(token) : Option.none<string>(),
        }
      }).pipe(
        Effect.scoped,
        // gh could not be started: it is not installed.
        Effect.catch(() => Effect.succeed({ installed: false, token: Option.none<string>() })),
      )

      const fromEnv = Effect.sync(() => {
        const token = process.env["GITHUB_TOKEN"]?.trim()
        return token ? Option.some(token) : Option.none<string>()
      })

      const lookUp = Effect.gen(function* () {
        const [saved, gh, env] = yield* Effect.all([fromFile, fromGh, fromEnv], {
          concurrency: "unbounded",
        })
        const found = (
          [
            ["token", saved],
            ["cli", gh.token],
            ["environment", env],
          ] as const
        ).find(([, token]) => Option.isSome(token))
        return {
          token: Option.map(found?.[1] ?? Option.none<string>(), Redacted.make),
          source: found?.[0] ?? null,
          cliInstalled: gh.installed,
        } satisfies ResolvedGitHubToken
      })

      // A login made while the daemon runs is picked up within a minute.
      const [resolve, invalidate] = yield* Effect.cachedInvalidateWithTTL(lookUp, "1 minute")

      const save = (token: Redacted.Redacted<string>) =>
        fs.writeFileString(config.githubTokenPath, Redacted.value(token), { mode: 0o600 }).pipe(
          // The data directory is Humanity's own; failing to write there is a defect.
          Effect.orDie,
          Effect.andThen(invalidate),
        )

      const clear = fs
        .remove(config.githubTokenPath, { force: true })
        .pipe(Effect.orDie, Effect.andThen(invalidate))

      return GitHubToken.of({
        get: Effect.map(resolve, (resolved) => resolved.token),
        resolve,
        invalidate,
        save,
        clear,
      })
    }),
  )

  /**
   * For tests: a fixed token (or none) standing in for `GITHUB_TOKEN`, no
   * GitHub CLI, and saved tokens kept in memory.
   */
  static readonly layerTest = (token: string | undefined) =>
    Layer.effect(
      GitHubToken,
      Effect.gen(function* () {
        const saved = yield* Ref.make(Option.none<Redacted.Redacted<string>>())
        const resolve = Effect.map(Ref.get(saved), (current): ResolvedGitHubToken => {
          if (Option.isSome(current)) {
            return { token: current, source: "token", cliInstalled: false }
          }
          return token === undefined
            ? { token: Option.none(), source: null, cliInstalled: false }
            : {
                token: Option.some(Redacted.make(token)),
                source: "environment",
                cliInstalled: false,
              }
        })
        return GitHubToken.of({
          get: Effect.map(resolve, (resolved) => resolved.token),
          resolve,
          invalidate: Effect.void,
          save: (value) => Ref.set(saved, Option.some(value)),
          clear: Ref.set(saved, Option.none()),
        })
      }),
    )
}
