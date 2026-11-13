import {
  type Branch,
  type FileDiff,
  GitBranchExists,
  GitCommandFailed,
  GitInvalidBranchName,
  GITLAB_FULL_PATH_PATTERN,
  GitNotARepository,
  GitNotInstalled,
  GitRefNotFound,
  type RepoStatus,
  type WorkingTreeDiff,
} from "@humanity/contracts"
import { computeHunks, parseUnifiedDiff } from "@humanity/diff"
import { Context, Effect, FileSystem, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { join, resolve } from "node:path"
import {
  BRANCH_FORMAT,
  parseBranches,
  parseStatus,
  parseWorktrees,
  type Worktree,
} from "./gitParsers.ts"

export type GitError = GitCommandFailed | GitNotARepository | GitNotInstalled

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** Untracked files larger than this are listed in a diff without their content. */
const MAX_UNTRACKED_DIFF_BYTES = 512 * 1024

// Options that keep git's output stable and parseable regardless of user config.
const STABLE_OUTPUT = ["-c", "core.quotepath=false", "-c", "color.ui=never"]

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
    /** Local and remote-tracking branches. */
    readonly listBranches: (cwd: string) => Effect.Effect<ReadonlyArray<Branch>, GitError>
    /** Creates a branch ref without checking it out. */
    readonly createBranch: (
      cwd: string,
      name: string,
      from: string,
    ) => Effect.Effect<Branch, GitError | GitBranchExists | GitInvalidBranchName | GitRefNotFound>
    /** Switches the working tree at `cwd` to an existing branch. */
    readonly checkout: (
      cwd: string,
      branch: string,
    ) => Effect.Effect<void, GitError | GitInvalidBranchName>
    readonly status: (cwd: string) => Effect.Effect<RepoStatus, GitError>
    /**
     * Changes in the working tree relative to `base` (default `HEAD`),
     * including untracked files, as reviewable hunks.
     */
    readonly diff: (cwd: string, base?: string) => Effect.Effect<WorkingTreeDiff, GitError>
    /** Adds a worktree at `path` on a new branch `branch` starting from `base`. */
    readonly worktreeAdd: (
      cwd: string,
      options: { readonly path: string; readonly branch: string; readonly base: string },
    ) => Effect.Effect<void, GitError | GitBranchExists | GitInvalidBranchName | GitRefNotFound>
    /** Removes a worktree, discarding uncommitted changes in it. Its branch is kept. */
    readonly worktreeRemove: (cwd: string, path: string) => Effect.Effect<void, GitError>
    readonly worktreeList: (cwd: string) => Effect.Effect<ReadonlyArray<Worktree>, GitError>
    /** Stages everything in `cwd` and commits it. Returns the new commit's short hash. */
    readonly commit: (cwd: string, message: string) => Effect.Effect<string, GitError>
    /**
     * Clones `url` into `target`, streaming git's progress lines. `env` adds
     * variables for this one process only, such as a credential header, so
     * nothing secret ends up in the clone's config or on the command line.
     */
    readonly clone: (
      url: string,
      target: string,
      env?: Readonly<Record<string, string>>,
    ) => Stream.Stream<string, GitError>
  }
>()("humanity/GitService") {
  static readonly layer = Layer.effect(
    GitService,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const fs = yield* FileSystem.FileSystem

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

      const listBranches = (cwd: string) =>
        exec(cwd, [...STABLE_OUTPUT, "branch", "--all", `--format=${BRANCH_FORMAT}`]).pipe(
          Effect.map(parseBranches),
        )

      // User-supplied names are validated by git itself before they are used as
      // arguments, so a name such as "--force" can never be read as an option.
      const validateBranchName = (cwd: string, name: string) =>
        Effect.gen(function* () {
          const check = yield* execResult(cwd, ["check-ref-format", "--branch", name])
          if (name.trim() === "" || name.startsWith("-") || check.exitCode !== 0) {
            return yield* new GitInvalidBranchName({ name })
          }
        })

      const branchExists = (cwd: string, name: string) =>
        execResult(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]).pipe(
          Effect.map((result) => result.exitCode === 0),
        )

      const requireCommit = (cwd: string, ref: string) =>
        Effect.gen(function* () {
          const result = yield* execResult(cwd, [
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            `${ref}^{commit}`,
          ])
          if (ref.startsWith("-") || result.exitCode !== 0) {
            return yield* new GitRefNotFound({ ref })
          }
        })

      const requireNewBranch = (cwd: string, name: string, from: string) =>
        Effect.gen(function* () {
          yield* validateBranchName(cwd, name)
          if (yield* branchExists(cwd, name)) return yield* new GitBranchExists({ name })
          yield* requireCommit(cwd, from)
        })

      const createBranch = Effect.fn("GitService.createBranch")(function* (
        cwd: string,
        name: string,
        from: string,
      ) {
        yield* requireNewBranch(cwd, name, from)
        yield* exec(cwd, ["branch", "--", name, from])
        const created = (yield* listBranches(cwd)).find(
          (branch) => branch.name === name && !branch.isRemote,
        )
        if (created === undefined) {
          return yield* new GitCommandFailed({
            args: ["branch", "--", name, from],
            exitCode: 0,
            stderr: "The branch was not found after it was created.",
          })
        }
        return created
      })

      const checkout = Effect.fn("GitService.checkout")(function* (cwd: string, branch: string) {
        yield* validateBranchName(cwd, branch)
        yield* exec(cwd, ["switch", "--quiet", branch])
      })

      const status = (cwd: string) =>
        exec(cwd, [
          ...STABLE_OUTPUT,
          "status",
          "--porcelain=v2",
          "--branch",
          "--untracked-files=all",
          "-z",
        ]).pipe(Effect.map(parseStatus))

      /** A new file is shown as one all-additions hunk; large or binary files have none. */
      const untrackedFileDiff = (cwd: string, path: string) =>
        Effect.gen(function* () {
          const absolute = join(cwd, path)
          const info = yield* fs.stat(absolute)
          if (info.type !== "File") return undefined
          if (Number(info.size) > MAX_UNTRACKED_DIFF_BYTES) {
            return { filePath: path, kind: "create", binary: true, hunks: [] } satisfies FileDiff
          }
          const content = yield* fs.readFileString(absolute)
          const binary = content.includes("\0")
          return {
            filePath: path,
            kind: "create",
            binary,
            hunks: binary ? [] : computeHunks("", content).map(({ id: _, status: __, ...h }) => h),
          } satisfies FileDiff
        }).pipe(Effect.catch(() => Effect.succeed(undefined)))

      const diff = Effect.fn("GitService.diff")(function* (cwd: string, base?: string) {
        // A repository without commits has no HEAD to compare against.
        const hasHead =
          (yield* execResult(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"])).exitCode === 0
        const against = base ?? "HEAD"
        const tracked = hasHead
          ? yield* exec(cwd, [
              ...STABLE_OUTPUT,
              "diff",
              "--no-color",
              "--no-ext-diff",
              "--find-renames",
              "--end-of-options",
              against,
            ])
          : ""
        const untrackedPaths = (yield* exec(cwd, [
          ...STABLE_OUTPUT,
          "ls-files",
          "--others",
          "--exclude-standard",
          "-z",
        ]))
          .split("\0")
          .filter((path) => path !== "")
        const untracked = yield* Effect.forEach(untrackedPaths, (path) =>
          untrackedFileDiff(cwd, path),
        )
        return {
          base: against,
          files: [...parseUnifiedDiff(tracked), ...untracked.filter((file) => file !== undefined)],
        } satisfies WorkingTreeDiff
      })

      const worktreeAdd = Effect.fn("GitService.worktreeAdd")(function* (
        cwd: string,
        options: { readonly path: string; readonly branch: string; readonly base: string },
      ) {
        yield* requireNewBranch(cwd, options.branch, options.base)
        yield* exec(cwd, [
          "worktree",
          "add",
          "--quiet",
          "-b",
          options.branch,
          "--",
          options.path,
          options.base,
        ])
      })

      const worktreeRemove = Effect.fn("GitService.worktreeRemove")(function* (
        cwd: string,
        path: string,
      ) {
        yield* exec(cwd, ["worktree", "remove", "--force", "--", path])
        yield* exec(cwd, ["worktree", "prune"])
      })

      const worktreeList = (cwd: string) =>
        exec(cwd, ["worktree", "list", "--porcelain"]).pipe(Effect.map(parseWorktrees))

      const commit = Effect.fn("GitService.commit")(function* (cwd: string, message: string) {
        yield* exec(cwd, ["add", "--all"])
        yield* exec(cwd, ["commit", "--quiet", "--message", message])
        return (yield* exec(cwd, ["rev-parse", "--short", "HEAD"])).trim()
      })

      const clone = (url: string, target: string, env: Readonly<Record<string, string>> = {}) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const args = ["clone", "--progress", "--", url, target]
            const handle = yield* spawner.spawn(
              ChildProcess.make("git", args, {
                extendEnv: true,
                env: { GIT_TERMINAL_PROMPT: "0", LC_ALL: "C", ...env },
                stdout: "ignore",
              }),
            )
            // Kept for the error message if the clone fails.
            const recent: Array<string> = []
            const progress = handle.stderr.pipe(
              Stream.decodeText(),
              // git redraws its progress with carriage returns.
              Stream.map((chunk) => chunk.replace(/\r/g, "\n")),
              Stream.splitLines,
              Stream.map((line) => line.trim()),
              Stream.filter((line) => line !== ""),
              Stream.tap((line) =>
                Effect.sync(() => {
                  recent.push(line)
                  if (recent.length > 20) recent.shift()
                }),
              ),
            )
            const finish = Stream.fromEffect(handle.exitCode).pipe(
              Stream.flatMap((exitCode) =>
                Number(exitCode) === 0
                  ? Stream.empty
                  : Stream.fail(
                      new GitCommandFailed({
                        args: ["clone", "--progress", "--", url, target],
                        exitCode: Number(exitCode),
                        stderr: recent.join("\n"),
                      }),
                    ),
              ),
            )
            return Stream.concat(progress, finish)
          }).pipe(Effect.mapError((cause) => new GitNotInstalled({ detail: String(cause) }))),
        ).pipe(
          Stream.mapError((error) =>
            error._tag === "GitCommandFailed" || error._tag === "GitNotInstalled"
              ? error
              : new GitNotInstalled({ detail: String(error) }),
          ),
        )

      return GitService.of({
        exec,
        execResult,
        repositoryRoot,
        currentBranch,
        defaultBranch,
        originUrl,
        listBranches,
        createBranch,
        checkout,
        status,
        diff,
        worktreeAdd,
        worktreeRemove,
        worktreeList,
        commit,
        clone,
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

/**
 * The instance and `group/name` of a remote URL (https or ssh) on one of the
 * GitLab `hosts`, otherwise `undefined`. Hosts are compared without their
 * port, since ssh and https use different ones.
 */
export const parseGitLabRemote = (
  remoteUrl: string | undefined,
  hosts: ReadonlyArray<string>,
): { readonly host: string; readonly fullPath: string } | undefined => {
  if (remoteUrl === undefined) return undefined
  const match = /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/i.exec(
    remoteUrl.trim(),
  )
  const name = match?.[1]?.toLowerCase()
  const fullPath = match?.[2]
  if (name === undefined || fullPath === undefined) return undefined
  if (!GITLAB_FULL_PATH_PATTERN.test(fullPath)) return undefined
  const host = hosts.find((candidate) => candidate.replace(/:\d+$/, "").toLowerCase() === name)
  return host === undefined ? undefined : { host, fullPath }
}
