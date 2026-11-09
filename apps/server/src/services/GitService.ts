import { GitCommandFailed, GitNotARepository, GitNotInstalled } from "@humanity/contracts"
import { Context, Effect, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { resolve } from "node:path"

export type GitError = GitCommandFailed | GitNotARepository | GitNotInstalled

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export class GitService extends Context.Service<
  GitService,
  {
    /**
     * Runs `git <args>` in `cwd` and returns stdout. Arguments are passed as an
     * array straight to the process; nothing is ever interpreted by a shell.
     */
    readonly exec: (cwd: string, args: ReadonlyArray<string>) => Effect.Effect<string, GitError>
    /** Like `exec`, but hands back the exit code instead of failing on non-zero. */
    readonly execResult: (
      cwd: string,
      args: ReadonlyArray<string>,
    ) => Effect.Effect<GitResult, GitNotInstalled>
    /** Absolute path of the repository containing `path`. */
    readonly repositoryRoot: (path: string) => Effect.Effect<string, GitError>
    /** Checked-out branch, or `undefined` on a detached HEAD. */
    readonly currentBranch: (cwd: string) => Effect.Effect<string | undefined, GitError>
    /** The remote's default branch when known, else the current branch, else `main`. */
    readonly defaultBranch: (cwd: string) => Effect.Effect<string, GitError>
    /** URL of `origin`, if the repository has one. */
    readonly originUrl: (cwd: string) => Effect.Effect<string | undefined, GitError>
  }
>()("humanity/GitService") {
  static readonly layer = Layer.effect(
    GitService,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
        stream.pipe(Stream.decodeText(), Stream.mkString)

      const execResult = (cwd: string, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("git", args, {
              cwd,
              extendEnv: true,
              // Never block on a credential prompt, and keep messages parseable.
              env: { GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
            }),
          )
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
            { concurrency: "unbounded" },
          )
          return { stdout, stderr, exitCode: Number(exitCode) } satisfies GitResult
        }).pipe(
          Effect.scoped,
          Effect.mapError((cause) => new GitNotInstalled({ detail: String(cause) })),
        )

      const exec = (cwd: string, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const result = yield* execResult(cwd, args)
          if (result.exitCode === 0) return result.stdout
          if (/not a git repository/i.test(result.stderr)) {
            return yield* new GitNotARepository({ path: cwd })
          }
          return yield* new GitCommandFailed({
            args: [...args],
            exitCode: result.exitCode,
            stderr: result.stderr,
          })
        })

      const repositoryRoot = (path: string) =>
        exec(path, ["rev-parse", "--show-toplevel"]).pipe(Effect.map((out) => resolve(out.trim())))

      const currentBranch = (cwd: string) =>
        exec(cwd, ["branch", "--show-current"]).pipe(Effect.map((out) => out.trim() || undefined))

      const defaultBranch = (cwd: string) =>
        Effect.gen(function* () {
          const remoteHead = yield* execResult(cwd, [
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
          ])
          const fromRemote = remoteHead.stdout.trim().replace(/^origin\//, "")
          if (remoteHead.exitCode === 0 && fromRemote !== "") return fromRemote
          return (yield* currentBranch(cwd)) ?? "main"
        })

      const originUrl = (cwd: string) =>
        execResult(cwd, ["remote", "get-url", "origin"]).pipe(
          Effect.map((result) =>
            result.exitCode === 0 ? result.stdout.trim() || undefined : undefined,
          ),
        )

      return GitService.of({
        exec,
        execResult,
        repositoryRoot,
        currentBranch,
        defaultBranch,
        originUrl,
      })
    }),
  )
}

/** `owner/repo` for a github.com remote URL (https or ssh), otherwise `undefined`. */
export const parseGitHubFullName = (remoteUrl: string | undefined): string | undefined => {
  if (remoteUrl === undefined) return undefined
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim())
  return match ? `${match[1]}/${match[2]}` : undefined
}
