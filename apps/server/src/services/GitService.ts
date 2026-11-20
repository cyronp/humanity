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
  LOG_FORMAT,
  type LoggedCommit,
  parseBranches,
  parseLog,
  parseStatus,
  parseWorktrees,
  type Worktree,
} from "./gitParsers.ts"
import { parseFileList } from "./fileSearch.ts"

export type GitError = GitCommandFailed | GitNotARepository | GitNotInstalled

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const MAX_UNTRACKED_DIFF_BYTES = 512 * 1024

const STABLE_OUTPUT = ["-c", "core.quotepath=false", "-c", "color.ui=never"]

export class GitService extends Context.Service<
  GitService,
  {
    readonly exec: (cwd: string, args: ReadonlyArray<string>) => Effect.Effect<string, GitError>
    readonly execResult: (
      cwd: string,
      args: ReadonlyArray<string>,
      env?: Readonly<Record<string, string>>,
    ) => Effect.Effect<GitResult, GitNotInstalled>
    readonly repositoryRoot: (path: string) => Effect.Effect<string, GitError>
    readonly currentBranch: (cwd: string) => Effect.Effect<string | undefined, GitError>
    readonly defaultBranch: (cwd: string) => Effect.Effect<string, GitError>
    readonly originUrl: (cwd: string) => Effect.Effect<string | undefined, GitError>
    readonly listBranches: (cwd: string) => Effect.Effect<ReadonlyArray<Branch>, GitError>
    readonly createBranch: (
      cwd: string,
      name: string,
      from: string,
    ) => Effect.Effect<Branch, GitError | GitBranchExists | GitInvalidBranchName | GitRefNotFound>
    readonly checkout: (
      cwd: string,
      branch: string,
    ) => Effect.Effect<void, GitError | GitInvalidBranchName>
    readonly status: (cwd: string) => Effect.Effect<RepoStatus, GitError>
    readonly listFiles: (cwd: string) => Effect.Effect<ReadonlyArray<string>, GitError>
    readonly hasCommit: (cwd: string, ref: string) => Effect.Effect<boolean, GitNotInstalled>
    readonly log: (
      cwd: string,
      ref: string,
      options: { readonly exclude?: string | undefined; readonly limit: number },
    ) => Effect.Effect<
      { readonly commits: ReadonlyArray<LoggedCommit>; readonly more: boolean },
      GitError | GitRefNotFound
    >
    /** The hashes of up to `limit` commits that `ref` has and `exclude` lacks, newest first. */
    readonly commitsNotIn: (
      cwd: string,
      ref: string,
      exclude: string,
      limit: number,
    ) => Effect.Effect<ReadonlyArray<string>, GitError>
    /** What `to` changes since it left `from` (`from...to`), file by file with its hunks. */
    readonly diffRange: (
      cwd: string,
      from: string,
      to: string,
    ) => Effect.Effect<ReadonlyArray<FileDiff>, GitError>
    readonly diff: (cwd: string, base?: string) => Effect.Effect<WorkingTreeDiff, GitError>
    readonly worktreeAdd: (
      cwd: string,
      options: { readonly path: string; readonly branch: string; readonly base: string },
    ) => Effect.Effect<void, GitError | GitBranchExists | GitInvalidBranchName | GitRefNotFound>
    readonly worktreeRemove: (cwd: string, path: string) => Effect.Effect<void, GitError>
    readonly worktreeList: (cwd: string) => Effect.Effect<ReadonlyArray<Worktree>, GitError>
    readonly commit: (
      cwd: string,
      message: string,
      paths?: ReadonlyArray<string>,
    ) => Effect.Effect<string, GitError>
    readonly push: (
      cwd: string,
      branch: string,
      env?: Readonly<Record<string, string>>,
    ) => Effect.Effect<void, GitError>
    readonly clone: (
      url: string,
      target: string,
      env?: Readonly<Record<string, string>>,
    ) => Stream.Stream<string, GitError>
    readonly fetch: (
      cwd: string,
      env?: Readonly<Record<string, string>>,
    ) => Effect.Effect<void, GitError>
    readonly revParse: (cwd: string, ref: string) => Effect.Effect<string | undefined, GitError>
    /** Commits only in `ref` (ahead) and only in `target` (behind). */
    readonly aheadBehind: (
      cwd: string,
      ref: string,
      target: string,
    ) => Effect.Effect<{ readonly ahead: number; readonly behind: number }, GitError>
    /** Fails, touching nothing, when uncommitted changes would be overwritten. */
    readonly fastForward: (cwd: string, target: string) => Effect.Effect<void, GitError>
    /**
     * Replays the checked-out branch onto `target`. On a conflict it aborts, leaving the branch
     * as it was, and returns the conflicted paths; an empty list means it was rebased.
     */
    readonly rebase: (cwd: string, target: string) => Effect.Effect<ReadonlyArray<string>, GitError>
    readonly changedFiles: (
      cwd: string,
      from: string,
      to: string,
    ) => Effect.Effect<ReadonlyArray<string>, GitError>
  }
>()("humanity/GitService") {
  static readonly layer = Layer.effect(
    GitService,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const fs = yield* FileSystem.FileSystem

      const collect = (stream: Stream.Stream<Uint8Array, unknown>) =>
        stream.pipe(Stream.decodeText(), Stream.mkString)

      const execResult = (
        cwd: string,
        args: ReadonlyArray<string>,
        env: Readonly<Record<string, string>> = {},
      ) =>
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("git", args, {
              cwd,
              extendEnv: true,
              env: { ...env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
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

      const exec = (
        cwd: string,
        args: ReadonlyArray<string>,
        env: Readonly<Record<string, string>> = {},
      ) =>
        Effect.gen(function* () {
          const result = yield* execResult(cwd, args, env)
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

      const listFiles = (cwd: string) =>
        exec(cwd, [
          ...STABLE_OUTPUT,
          "ls-files",
          "--cached",
          "--others",
          "--exclude-standard",
          "-z",
        ]).pipe(Effect.map(parseFileList))

      const hasCommit = (cwd: string, ref: string) =>
        requireCommit(cwd, ref).pipe(
          Effect.as(true),
          Effect.catch((error) =>
            error._tag === "GitRefNotFound" ? Effect.succeed(false) : Effect.fail(error),
          ),
        )

      const log = Effect.fn("GitService.log")(function* (
        cwd: string,
        ref: string,
        options: { readonly exclude?: string | undefined; readonly limit: number },
      ) {
        yield* requireCommit(cwd, ref)
        if (options.exclude !== undefined) yield* requireCommit(cwd, options.exclude)
        const revisions = options.exclude === undefined ? [ref] : [ref, `^${options.exclude}`]
        const output = yield* exec(cwd, [
          ...STABLE_OUTPUT,
          "log",
          `--max-count=${options.limit + 1}`,
          `--format=${LOG_FORMAT}`,
          "--numstat",
          "--end-of-options",
          ...revisions,
          "--",
        ])
        const commits = parseLog(output)
        return { commits: commits.slice(0, options.limit), more: commits.length > options.limit }
      })

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

      const commit = Effect.fn("GitService.commit")(function* (
        cwd: string,
        message: string,
        paths?: ReadonlyArray<string>,
      ) {
        if (paths === undefined || paths.length === 0) {
          yield* exec(cwd, ["add", "--all"])
          yield* exec(cwd, ["commit", "--quiet", "--message", message])
        } else {
          const pathspecs = paths.map((path) => `:(literal)${path}`)
          yield* exec(cwd, ["add", "--all", "--", ...pathspecs])
          yield* exec(cwd, ["commit", "--quiet", "--message", message, "--", ...pathspecs])
        }
        return (yield* exec(cwd, ["rev-parse", "--short", "HEAD"])).trim()
      })

      const push = Effect.fn("GitService.push")(function* (
        cwd: string,
        branch: string,
        env: Readonly<Record<string, string>> = {},
      ) {
        const ref = `refs/heads/${branch}`
        yield* exec(cwd, ["push", "--quiet", "--set-upstream", "origin", `${ref}:${ref}`], env)
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
            const recent: Array<string> = []
            const progress = handle.stderr.pipe(
              Stream.decodeText(),
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

      const fetch = Effect.fn("GitService.fetch")(function* (
        cwd: string,
        env: Readonly<Record<string, string>> = {},
      ) {
        yield* exec(cwd, ["fetch", "--quiet", "--prune", "--no-recurse-submodules", "origin"], env)
      })

      const revParse = (cwd: string, ref: string) =>
        execResult(cwd, [
          "rev-parse",
          "--verify",
          "--quiet",
          "--end-of-options",
          `${ref}^{commit}`,
        ]).pipe(
          Effect.map((result) =>
            ref.startsWith("-") || result.exitCode !== 0 ? undefined : result.stdout.trim(),
          ),
        )

      const commitsNotIn = (cwd: string, ref: string, exclude: string, limit: number) =>
        exec(cwd, [
          "rev-list",
          `--max-count=${limit}`,
          "--end-of-options",
          ref,
          `^${exclude}`,
          "--",
        ]).pipe(
          Effect.map((out) =>
            out
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line !== ""),
          ),
        )

      const diffRange = (cwd: string, from: string, to: string) =>
        exec(cwd, [
          ...STABLE_OUTPUT,
          "diff",
          "--no-color",
          "--no-ext-diff",
          "--find-renames",
          "--end-of-options",
          `${from}...${to}`,
          "--",
        ]).pipe(Effect.map(parseUnifiedDiff))

      const aheadBehind = (cwd: string, ref: string, target: string) =>
        exec(cwd, [
          "rev-list",
          "--left-right",
          "--count",
          "--end-of-options",
          `${ref}...${target}`,
        ]).pipe(
          Effect.map((out) => {
            const [ahead = 0, behind = 0] = out.trim().split(/\s+/).map(Number)
            return { ahead, behind }
          }),
        )

      const fastForward = Effect.fn("GitService.fastForward")(function* (
        cwd: string,
        target: string,
      ) {
        yield* exec(cwd, ["merge", "--ff-only", "--quiet", "--no-stat", "--end-of-options", target])
      })

      const rebase = Effect.fn("GitService.rebase")(function* (cwd: string, target: string) {
        const args = [
          "-c",
          "rebase.autoStash=false",
          "rebase",
          "--quiet",
          "--end-of-options",
          target,
        ]
        const result = yield* execResult(cwd, args)
        if (result.exitCode === 0) return []
        const conflicts = (yield* execResult(cwd, [
          ...STABLE_OUTPUT,
          "diff",
          "--name-only",
          "--diff-filter=U",
          "-z",
        ])).stdout
          .split("\0")
          .filter((path) => path !== "")
        yield* execResult(cwd, ["rebase", "--abort"])
        if (conflicts.length > 0) return conflicts
        return yield* new GitCommandFailed({
          args,
          exitCode: result.exitCode,
          stderr: result.stderr,
        })
      })

      const changedFiles = (cwd: string, from: string, to: string) =>
        exec(cwd, [
          ...STABLE_OUTPUT,
          "diff",
          "--name-only",
          "--no-renames",
          "-z",
          from,
          to,
          "--",
        ]).pipe(Effect.map((out) => out.split("\0").filter((path) => path !== "")))

      return GitService.of({
        fetch,
        revParse,
        aheadBehind,
        fastForward,
        rebase,
        changedFiles,
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
        listFiles,
        hasCommit,
        log,
        commitsNotIn,
        diffRange,
        diff,
        worktreeAdd,
        worktreeRemove,
        worktreeList,
        commit,
        push,
        clone,
      })
    }),
  )
}

export const parseGitHubFullName = (remoteUrl: string | undefined): string | undefined => {
  if (remoteUrl === undefined) return undefined
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim())
  return match ? `${match[1]}/${match[2]}` : undefined
}

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
