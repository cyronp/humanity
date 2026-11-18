import {
  GITLAB_DEFAULT_HOST,
  type GitLabTokenSource,
  normalizeGitLabHost,
} from "@humanity/contracts"
import { Context, Effect, FileSystem, Layer, Option, Redacted, Ref, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { ServerConfig } from "../ServerConfig.ts"

export interface ResolvedGitLabToken {
  readonly token: Option.Option<Redacted.Redacted<string>>
  readonly source: GitLabTokenSource | null
  readonly host: string
  readonly cliInstalled: boolean
}

export class GitLabToken extends Context.Service<
  GitLabToken,
  {
    readonly resolve: Effect.Effect<ResolvedGitLabToken>
    readonly invalidate: Effect.Effect<void>
    readonly save: (token: Redacted.Redacted<string>, host: string) => Effect.Effect<void>
    readonly clear: Effect.Effect<void>
  }
>()("humanity/GitLabToken") {
  static readonly layer = Layer.effect(
    GitLabToken,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const fs = yield* FileSystem.FileSystem
      const config = yield* ServerConfig

      const readTrimmed = (path: string) =>
        fs.readFileString(path).pipe(
          Effect.map((text) => text.trim() || undefined),
          Effect.catch(() => Effect.succeed(undefined)),
        )

      const fromFile = Effect.gen(function* () {
        const token = yield* readTrimmed(config.gitlabTokenPath)
        const host = normalizeGitLabHost((yield* readTrimmed(config.gitlabHostPath)) ?? "")
        return { token: Option.fromNullishOr(token), host: host ?? GITLAB_DEFAULT_HOST }
      })

      const glabConfig = (...args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("glab", ["config", "get", ...args], { extendEnv: true }),
          )
          const [stdout, exitCode] = yield* Effect.all(
            [handle.stdout.pipe(Stream.decodeText(), Stream.mkString), handle.exitCode],
            { concurrency: "unbounded" },
          )
          return Number(exitCode) === 0 ? stdout.trim() : ""
        }).pipe(
          Effect.scoped,
          Effect.catch(() => Effect.succeed(undefined)),
        )

      const fromGlab = Effect.gen(function* () {
        const configured = yield* glabConfig("host")
        if (configured === undefined) {
          return { installed: false, token: Option.none<string>(), host: GITLAB_DEFAULT_HOST }
        }
        const host = normalizeGitLabHost(configured) ?? GITLAB_DEFAULT_HOST
        const token = yield* glabConfig("token", "--host", host)
        return { installed: true, token: Option.fromNullishOr(token || undefined), host }
      })

      const fromEnv = Effect.sync(() => {
        const token = process.env["GITLAB_TOKEN"]?.trim()
        const named = process.env["GITLAB_HOST"]?.trim()
        const host = named ? normalizeGitLabHost(named) : GITLAB_DEFAULT_HOST
        return {
          token: token && host !== undefined ? Option.some(token) : Option.none<string>(),
          host: host ?? GITLAB_DEFAULT_HOST,
        }
      })

      const lookUp = Effect.gen(function* () {
        const [saved, glab, env] = yield* Effect.all([fromFile, fromGlab, fromEnv], {
          concurrency: "unbounded",
        })
        const found = (
          [
            ["token", saved],
            ["cli", glab],
            ["environment", env],
          ] as const
        ).find(([, candidate]) => Option.isSome(candidate.token))
        return {
          token: Option.map(found?.[1].token ?? Option.none<string>(), Redacted.make),
          source: found?.[0] ?? null,
          host: found?.[1].host ?? glab.host,
          cliInstalled: glab.installed,
        } satisfies ResolvedGitLabToken
      })

      const [resolve, invalidate] = yield* Effect.cachedInvalidateWithTTL(lookUp, "1 minute")

      const save = (token: Redacted.Redacted<string>, host: string) =>
        Effect.all([
          fs.writeFileString(config.gitlabTokenPath, Redacted.value(token), { mode: 0o600 }),
          fs.writeFileString(config.gitlabHostPath, host),
        ]).pipe(
          Effect.orDie,
          Effect.andThen(invalidate),
        )

      const clear = Effect.all([
        fs.remove(config.gitlabTokenPath, { force: true }),
        fs.remove(config.gitlabHostPath, { force: true }),
      ]).pipe(Effect.orDie, Effect.andThen(invalidate))

      return GitLabToken.of({ resolve, invalidate, save, clear })
    }),
  )

  static readonly layerTest = (token: string | undefined) =>
    Layer.effect(
      GitLabToken,
      Effect.gen(function* () {
        const saved = yield* Ref.make(
          Option.none<{ token: Redacted.Redacted<string>; host: string }>(),
        )
        const resolve = Effect.map(Ref.get(saved), (current): ResolvedGitLabToken => {
          if (Option.isSome(current)) {
            return {
              token: Option.some(current.value.token),
              source: "token",
              host: current.value.host,
              cliInstalled: false,
            }
          }
          return token === undefined
            ? { token: Option.none(), source: null, host: GITLAB_DEFAULT_HOST, cliInstalled: false }
            : {
                token: Option.some(Redacted.make(token)),
                source: "environment",
                host: GITLAB_DEFAULT_HOST,
                cliInstalled: false,
              }
        })
        return GitLabToken.of({
          resolve,
          invalidate: Effect.void,
          save: (value, host) => Ref.set(saved, Option.some({ token: value, host })),
          clear: Ref.set(saved, Option.none()),
        })
      }),
    )
}
