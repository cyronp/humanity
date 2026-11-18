import type { GitHubTokenSource } from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Option, Redacted, Ref, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { ServerConfig } from "../ServerConfig.ts"

export interface ResolvedGitHubToken {
  readonly token: Option.Option<Redacted.Redacted<string>>
  readonly source: GitHubTokenSource | null
  readonly cliInstalled: boolean
}

export class GitHubToken extends Context.Service<
  GitHubToken,
  {
    readonly get: Effect.Effect<Option.Option<Redacted.Redacted<string>>>
    readonly resolve: Effect.Effect<ResolvedGitHubToken>
    readonly invalidate: Effect.Effect<void>
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

      const [resolve, invalidate] = yield* Effect.cachedInvalidateWithTTL(lookUp, "1 minute")

      const save = (token: Redacted.Redacted<string>) =>
        fs.writeFileString(config.githubTokenPath, Redacted.value(token), { mode: 0o600 }).pipe(
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
