import {
  type BranchPublication,
  type Forge,
  GITLAB_DEFAULT_HOST,
  type MergeMethod,
  type MergePullRequest,
  type NewPullRequest,
  type Project,
  type ProjectNotFound,
  type PullRequest,
  type PullRequestFeed,
  PullRequestUnavailable,
  type RepoStatus,
  type Session,
  type SessionNotFound,
  type SyncResult,
  type SyncStatus,
  SyncUnavailable,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option, Semaphore, Stream } from "effect"
import { EMPTY_FEED, ForgeSync, type ForgeTarget } from "./ForgeSync.ts"
import { credentialEnv } from "./gitCredentials.ts"
import { type GitHubError, GitHubService } from "./GitHubService.ts"
import { type GitLabError, GitLabService } from "./GitLabService.ts"
import { type GitError, GitService, parseGitHubFullName, parseGitLabRemote } from "./GitService.ts"
import { ProjectService } from "./ProjectService.ts"
import { SessionService, threadBranch } from "./SessionService.ts"

type Base = SessionNotFound | ProjectNotFound | GitError

type Remote =
  | { readonly forge: "github"; readonly fullName: string }
  | {
      readonly forge: "gitlab"
      readonly fullPath: string
      readonly host: string
      readonly mismatch: string | null
    }

interface Tracking {
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
}

/** A fetch younger than this answers a background status check without fetching again. */
const FETCH_FRESH_MS = 60_000

const AGENT_FILE_LIST_LIMIT = 20

interface Fetched {
  readonly at: string
  readonly ms: number
  readonly error: string | null
}

const commits = (count: number) => `${count} commit${count === 1 ? "" : "s"}`

const files = (count: number) => `${count} file${count === 1 ? "" : "s"}`

const gitProblem = (error: GitError) =>
  error._tag === "GitCommandFailed"
    ? error.stderr
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .join(" ") || error.message
    : error.message

/** The paths git lists, one per tab-indented line, when it refuses to overwrite them. */
const overwrittenPaths = (stderr: string) =>
  stderr
    .split("\n")
    .filter((line) => line.startsWith("\t"))
    .map((line) => line.trim())
    .filter((line) => line !== "")

const listPaths = (paths: ReadonlyArray<string>, limit: number) =>
  paths.length <= limit
    ? paths.join(", ")
    : `${paths.slice(0, limit).join(", ")} and ${paths.length - limit} more`

const isBusy = (session: Session) =>
  session.status === "running" || session.status === "waiting_for_human"

const sameHost = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const targetOf = (remote: Remote | null, branch: string | null): ForgeTarget | null => {
  if (remote === null || branch === null) return null
  if (remote.forge === "github") return { forge: "github", fullName: remote.fullName, branch }
  if (remote.mismatch !== null) return null
  return { forge: "gitlab", host: remote.host, fullPath: remote.fullPath, branch }
}

export class PullRequestService extends Context.Service<
  PullRequestService,
  {
    readonly publication: (sessionId: string) => Effect.Effect<BranchPublication, Base>
    readonly push: (
      sessionId: string,
    ) => Effect.Effect<BranchPublication, Base | PullRequestUnavailable>
    readonly create: (
      sessionId: string,
      pullRequest: NewPullRequest,
    ) => Effect.Effect<PullRequest, Base | GitHubError | GitLabError | PullRequestUnavailable>
    /**
     * Merges the open pull request of the thread's branch at the head commit the human saw,
     * posting their comment on it first.
     */
    readonly merge: (
      sessionId: string,
      merge: MergePullRequest,
    ) => Effect.Effect<PullRequest, Base | GitHubError | GitLabError | PullRequestUnavailable>
    /** Closes the pull request of the thread's branch, or reopens a closed one. */
    readonly setOpen: (
      sessionId: string,
      open: boolean,
    ) => Effect.Effect<PullRequest, Base | GitHubError | GitLabError | PullRequestUnavailable>
    /** Converts the open pull request of the thread's branch to a draft, or marks it ready. */
    readonly setDraft: (
      sessionId: string,
      draft: boolean,
    ) => Effect.Effect<PullRequest, Base | GitHubError | GitLabError | PullRequestUnavailable>
    readonly watch: (sessionId: string) => Stream.Stream<PullRequestFeed, Base>
    readonly refresh: (sessionId: string) => Effect.Effect<void, Base>
    /** With `fetch`, fetches origin first unless that was done in the last minute. */
    readonly syncStatus: (sessionId: string, fetch: boolean) => Effect.Effect<SyncStatus, Base>
    /**
     * Fetches origin, brings the thread's branch up to date with its sync target (fast-forward,
     * else a rebase of its own commits when the folder is clean), then pushes to an upstream of
     * the same name. Anything it cannot do safely fails before the folder is changed.
     */
    readonly sync: (sessionId: string) => Effect.Effect<SyncResult, Base | SyncUnavailable>
  }
>()("humanity/PullRequestService") {
  static readonly layer = Layer.effect(
    PullRequestService,
    Effect.gen(function* () {
      const sessions = yield* SessionService
      const projects = yield* ProjectService
      const git = yield* GitService
      const github = yield* GitHubService
      const gitlab = yield* GitLabService
      const sync = yield* ForgeSync
      const lastSeen = new Map<
        string,
        { branch: string | null; upstream: string | null; ahead: number }
      >()

      const remoteOf = (project: Project) =>
        Effect.gen(function* () {
          if (project.githubFullName !== null) {
            return { forge: "github", fullName: project.githubFullName } satisfies Remote
          }
          const { host } = yield* gitlab.credentials
          let onGitLab = project.gitlab
          if (onGitLab === null) {
            const origin = yield* git.originUrl(project.localPath)
            const fullName = parseGitHubFullName(origin)
            if (fullName !== undefined) return { forge: "github", fullName } satisfies Remote
            onGitLab = parseGitLabRemote(origin, [host, GITLAB_DEFAULT_HOST]) ?? null
          }
          if (onGitLab === null) return null
          return {
            forge: "gitlab",
            fullPath: onGitLab.fullPath,
            host: onGitLab.host,
            mismatch: sameHost(host, onGitLab.host)
              ? null
              : `GitLab is connected to ${host}, but this project is on ${onGitLab.host}. Connect ${onGitLab.host} in Settings → Repositories.`,
          } satisfies Remote
        })

      const trackingOf = (cwd: string, branch: string | null, status: RepoStatus) =>
        branch === null || branch === status.branch
          ? Effect.succeed<Tracking>(status)
          : Effect.map(git.listBranches(cwd), (branches): Tracking => {
              const found = branches.find((each) => !each.isRemote && each.name === branch)
              return {
                upstream: found?.upstream ?? null,
                ahead: found?.ahead ?? 0,
                behind: found?.behind ?? 0,
              }
            })

      const load = (sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(sessionId)
          const project = yield* projects.get(session.projectId)
          const status = yield* git.status(session.worktreePath)
          const remote = yield* remoteOf(project)
          const branch = threadBranch(session)
          const tracking = yield* trackingOf(session.worktreePath, branch, status)
          return { session, project, status, remote, branch, tracking }
        })

      const find = (
        remote: Remote,
        branch: string,
      ): Effect.Effect<Option.Option<PullRequest>, GitHubError | GitLabError> =>
        remote.forge === "github"
          ? github.findPullRequest(remote.fullName, branch)
          : gitlab.findMergeRequest(remote.fullPath, branch)

      const describe = ({
        project,
        status,
        remote,
        branch,
        tracking,
      }: {
        readonly project: Project
        readonly status: RepoStatus
        readonly remote: Remote | null
        readonly branch: string | null
        readonly tracking: Tracking
      }): BranchPublication => ({
        forge: remote?.forge ?? null,
        branch,
        checkedOut: status.branch,
        defaultBranch: project.defaultBranch,
        upstream: tracking.upstream,
        ahead: tracking.ahead,
        behind: tracking.behind,
        uncommitted: branch === null || branch === status.branch ? status.entries.length : 0,
      })

      const notePush = (
        sessionId: string,
        branch: string | null,
        tracking: Tracking,
        remote: Remote | null,
      ) =>
        Effect.suspend(() => {
          const before = lastSeen.get(sessionId)
          lastSeen.set(sessionId, { branch, upstream: tracking.upstream, ahead: tracking.ahead })
          const target = targetOf(remote, branch)
          const pushed =
            before !== undefined &&
            before.branch === branch &&
            tracking.upstream !== null &&
            (before.upstream !== tracking.upstream || tracking.ahead < before.ahead)
          return pushed && target !== null ? sync.changed(target) : Effect.void
        })

      const publication = Effect.fn("PullRequestService.publication")(function* (
        sessionId: string,
      ) {
        const loaded = yield* load(sessionId)
        yield* notePush(sessionId, loaded.branch, loaded.tracking, loaded.remote)
        return describe(loaded)
      })

      const pushEnv = (remote: Remote | null) =>
        Effect.gen(function* () {
          if (remote === null) return {}
          if (remote.forge === "github") {
            return credentialEnv("https://github.com", "x-access-token", yield* github.token)
          }
          const { host, token } = yield* gitlab.credentials
          if (!sameHost(host, remote.host)) return {}
          return credentialEnv(`https://${host}`, "oauth2", token)
        })

      const requireIdle = (session: Session) =>
        isBusy(session)
          ? Effect.fail(
              new PullRequestUnavailable({
                reason:
                  "The agent is still working. Wait until it is idle, or interrupt it, before pushing.",
              }),
            )
          : Effect.void

      const requireBranch = (branch: string | null) =>
        branch === null
          ? Effect.fail(
              new PullRequestUnavailable({
                reason:
                  "This thread started on a detached HEAD, so it has no branch of its own. Check out a branch first.",
              }),
            )
          : Effect.succeed(branch)

      const push = Effect.fn("PullRequestService.push")(function* (sessionId: string) {
        const { session, remote, branch: own } = yield* load(sessionId)
        yield* requireIdle(session)
        const branch = yield* requireBranch(own)
        yield* git.push(session.worktreePath, branch, yield* pushEnv(remote))
        const after = yield* load(sessionId)
        lastSeen.set(sessionId, {
          branch,
          upstream: after.tracking.upstream,
          ahead: after.tracking.ahead,
        })
        const target = targetOf(remote, branch)
        if (target !== null) yield* sync.changed(target)
        return describe(after)
      })

      const forgeName = (forge: Forge) => (forge === "github" ? "pull request" : "merge request")

      const create = Effect.fn("PullRequestService.create")(function* (
        sessionId: string,
        input: NewPullRequest,
      ) {
        const { session, remote, branch: own, tracking } = yield* load(sessionId)
        yield* requireIdle(session)
        if (remote === null) {
          return yield* new PullRequestUnavailable({
            reason:
              "This project's origin is not on GitHub or on a connected GitLab instance, so Humanity can't open a pull request for it.",
          })
        }
        if (remote.forge === "gitlab" && remote.mismatch !== null) {
          return yield* new PullRequestUnavailable({ reason: remote.mismatch })
        }
        const branch = yield* requireBranch(own)
        if (branch === input.base) {
          return yield* new PullRequestUnavailable({
            reason: `The ${forgeName(remote.forge)} would merge ${branch} into itself. Pick another base branch, or work on another branch.`,
          })
        }
        const existing = Option.getOrNull(yield* find(remote, branch))
        if (existing !== null && (existing.state === "open" || existing.state === "draft")) {
          return yield* new PullRequestUnavailable({
            reason: `${branch} already has an open ${forgeName(remote.forge)}: ${existing.url}`,
          })
        }
        if (tracking.upstream === null || tracking.ahead > 0) {
          yield* git.push(session.worktreePath, branch, yield* pushEnv(remote))
        }
        const created =
          remote.forge === "github"
            ? yield* github.createPullRequest(remote.fullName, {
                head: branch,
                base: input.base,
                title: input.title.trim(),
                body: input.body,
                draft: input.draft,
              })
            : yield* gitlab.createMergeRequest(remote.fullPath, {
                sourceBranch: branch,
                targetBranch: input.base,
                title: input.title.trim(),
                description: input.body,
                draft: input.draft,
              })
        const target = targetOf(remote, branch)
        if (target !== null) yield* sync.opened(target, created)
        return created
      })

      const reachable = (remote: Remote | null) => {
        if (remote === null) {
          return Effect.fail(
            new PullRequestUnavailable({
              reason:
                "This project's origin is not on GitHub or on a connected GitLab instance, so Humanity can't change its pull requests.",
            }),
          )
        }
        if (remote.forge === "gitlab" && remote.mismatch !== null) {
          return Effect.fail(new PullRequestUnavailable({ reason: remote.mismatch }))
        }
        return Effect.succeed(remote)
      }

      /** The thread's branch's pull request as the forge has it now, not as the feed last saw it. */
      const current = (sessionId: string) =>
        Effect.gen(function* () {
          const { session, remote: found, branch: own } = yield* load(sessionId)
          const remote = yield* reachable(found)
          const branch = yield* requireBranch(own)
          const pullRequest = Option.getOrNull(yield* find(remote, branch))
          if (pullRequest === null) {
            return yield* new PullRequestUnavailable({
              reason: `${branch} has no ${forgeName(remote.forge)}.`,
            })
          }
          return { session, remote, pullRequest, target: targetOf(remote, branch) }
        })

      const notOpen = (pullRequest: PullRequest) => {
        const noun = forgeName(pullRequest.forge)
        return new PullRequestUnavailable({
          reason:
            pullRequest.state === "merged"
              ? `This ${noun} is already merged.`
              : `This ${noun} is closed. Reopen it first.`,
        })
      }

      const MERGED_HOW: Record<MergeMethod, string> = {
        squash: "squashed",
        merge: "with a merge commit",
        rebase: "rebased",
      }

      const merge = Effect.fn("PullRequestService.merge")(function* (
        sessionId: string,
        input: MergePullRequest,
      ) {
        const { session, remote, pullRequest, target } = yield* current(sessionId)
        const noun = forgeName(remote.forge)
        if (pullRequest.state === "draft") {
          return yield* new PullRequestUnavailable({
            reason: `This ${noun} is a draft. Mark it ready for review before merging it.`,
          })
        }
        if (pullRequest.state !== "open") return yield* notOpen(pullRequest)
        if (input.headSha === "" || pullRequest.headSha !== input.headSha) {
          return yield* new PullRequestUnavailable({
            reason: `This ${noun} has new commits since you looked at it, so nothing was merged. Look at them, then merge again.`,
          })
        }
        if (remote.forge === "gitlab" && input.method === "rebase") {
          return yield* new PullRequestUnavailable({
            reason:
              "GitLab merges by the project's own merge method. Pick Merge or Squash and merge.",
          })
        }
        const comment = input.comment.trim()
        if (comment !== "") {
          yield* remote.forge === "github"
            ? github.commentOnPullRequest(remote.fullName, pullRequest.number, comment)
            : gitlab.commentOnMergeRequest(remote.fullPath, pullRequest.number, comment)
        }
        const merged =
          remote.forge === "github"
            ? yield* github.mergePullRequest(remote.fullName, pullRequest.number, {
                method: input.method,
                sha: pullRequest.headSha,
              })
            : yield* gitlab.mergeMergeRequest(remote.fullPath, pullRequest.number, {
                squash: input.method === "squash",
                sha: pullRequest.headSha,
              })
        if (target !== null) yield* sync.updated(target, merged)
        const symbol = remote.forge === "github" ? "#" : "!"
        yield* sessions.tell(session.id, {
          notice: `Merged ${symbol}${merged.number} into ${merged.base}, ${MERGED_HOW[input.method]}.`,
        })
        return merged
      })

      const setOpen = Effect.fn("PullRequestService.setOpen")(function* (
        sessionId: string,
        open: boolean,
      ) {
        const { remote, pullRequest, target } = yield* current(sessionId)
        const noun = forgeName(remote.forge)
        if (pullRequest.state === "merged") return yield* notOpen(pullRequest)
        if (open && pullRequest.state !== "closed") {
          return yield* new PullRequestUnavailable({ reason: `This ${noun} is already open.` })
        }
        if (!open && pullRequest.state === "closed") {
          return yield* new PullRequestUnavailable({ reason: `This ${noun} is already closed.` })
        }
        const updated =
          remote.forge === "github"
            ? yield* github.setPullRequestOpen(remote.fullName, pullRequest.number, open)
            : yield* gitlab.setMergeRequestOpen(remote.fullPath, pullRequest.number, open)
        if (target !== null) yield* sync.updated(target, updated)
        return updated
      })

      const setDraft = Effect.fn("PullRequestService.setDraft")(function* (
        sessionId: string,
        draft: boolean,
      ) {
        const { remote, pullRequest, target } = yield* current(sessionId)
        if (pullRequest.state !== "open" && pullRequest.state !== "draft") {
          return yield* notOpen(pullRequest)
        }
        if ((pullRequest.state === "draft") === draft) return pullRequest
        const updated =
          remote.forge === "github"
            ? yield* github.setPullRequestDraft(remote.fullName, pullRequest.number, draft)
            : yield* gitlab.setMergeRequestDraft(remote.fullPath, pullRequest, draft)
        if (target !== null) yield* sync.updated(target, updated)
        return updated
      })

      const watch = (sessionId: string) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const { remote, branch } = yield* load(sessionId)
            const target = targetOf(remote, branch)
            if (target !== null) return sync.watch(target)
            const problem = remote?.forge === "gitlab" ? remote.mismatch : null
            const feed: PullRequestFeed = { ...EMPTY_FEED, problem }
            return Stream.make(feed)
          }),
        )

      const refresh = Effect.fn("PullRequestService.refresh")(function* (sessionId: string) {
        const { remote, branch } = yield* load(sessionId)
        const target = targetOf(remote, branch)
        if (target !== null) yield* sync.refresh(target)
      })

      const fetched = new Map<string, Fetched>()
      const network = yield* Semaphore.make(1)

      const fetchOrigin = (project: Project, remote: Remote | null, force: boolean) =>
        network.withPermits(1)(
          Effect.gen(function* () {
            const last = fetched.get(project.localPath)
            if (!force && last !== undefined && Date.now() - last.ms < FETCH_FRESH_MS) return last
            // Only a click may open a credential helper's sign-in window; a background fetch fails.
            const quiet = force ? {} : { GCM_INTERACTIVE: "never" }
            const env = { ...(yield* pushEnv(remote)), ...quiet }
            const error = yield* git.fetch(project.localPath, env).pipe(
              Effect.as(null),
              Effect.catch((failure) => Effect.succeed(gitProblem(failure))),
            )
            const entry: Fetched = { at: new Date().toISOString(), ms: Date.now(), error }
            fetched.set(project.localPath, entry)
            return entry
          }),
        )

      const syncTarget = (
        cwd: string,
        project: Project,
        branch: string | null,
        tracking: Tracking,
      ) =>
        Effect.gen(function* () {
          if (tracking.upstream !== null) {
            const resolves = (yield* git.revParse(cwd, tracking.upstream)) !== undefined
            return resolves
              ? {
                  target: tracking.upstream,
                  pushes: branch !== null && tracking.upstream === `origin/${branch}`,
                }
              : { target: null, pushes: false }
          }
          const fallback = `origin/${project.defaultBranch}`
          const resolves = (yield* git.revParse(cwd, fallback)) !== undefined
          return { target: resolves ? fallback : null, pushes: false }
        })

      const describeSync = (
        loaded: Effect.Success<ReturnType<typeof load>>,
        hasRemote: boolean,
        entry: Fetched | undefined,
      ) =>
        Effect.gen(function* () {
          const { session, project, branch, tracking } = loaded
          const cwd = session.worktreePath
          const { target, pushes } = yield* syncTarget(cwd, project, branch, tracking)
          const counts =
            target === null
              ? { ahead: 0, behind: 0 }
              : yield* git.aheadBehind(
                  cwd,
                  branch === null ? "HEAD" : `refs/heads/${branch}`,
                  target,
                )
          return {
            branch,
            hasRemote,
            target,
            pushes,
            ahead: counts.ahead,
            behind: counts.behind,
            fetchedAt: entry?.at ?? null,
            fetchError: entry?.error ?? null,
          } satisfies SyncStatus
        })

      const syncStatus = Effect.fn("PullRequestService.syncStatus")(function* (
        sessionId: string,
        fetch: boolean,
      ) {
        const session = yield* sessions.get(sessionId)
        const project = yield* projects.get(session.projectId)
        const hasRemote = (yield* git.originUrl(project.localPath)) !== undefined
        const entry =
          hasRemote && fetch
            ? yield* fetchOrigin(project, yield* remoteOf(project), false)
            : fetched.get(project.localPath)
        return yield* describeSync(yield* load(sessionId), hasRemote, entry)
      })

      const unavailable = (reason: string) => Effect.fail(new SyncUnavailable({ reason }))

      const syncBranch = Effect.fn("PullRequestService.sync")(function* (sessionId: string) {
        const session = yield* sessions.get(sessionId)
        const project = yield* projects.get(session.projectId)
        const cwd = session.worktreePath
        const sharing = (yield* sessions.list(project.id)).filter(
          (each) => each.id !== session.id && each.worktreePath === cwd && each.status !== "ended",
        )
        const busy = isBusy(session) ? session : sharing.find(isBusy)
        if (busy !== undefined) {
          return yield* unavailable(
            busy.id === session.id
              ? "The agent is still working. Wait until it is idle, or interrupt it, before syncing."
              : `"${busy.title}" works in the same folder and is still running. Wait until it is idle, or interrupt it, before syncing.`,
          )
        }
        const branch = threadBranch(session)
        if (branch === null) {
          return yield* unavailable(
            "This thread started on a detached HEAD, so it has no branch to sync. Check out a branch first.",
          )
        }
        if ((yield* git.originUrl(project.localPath)) === undefined) {
          return yield* unavailable("This project has no origin remote to sync with.")
        }
        const remote = yield* remoteOf(project)
        const entry = yield* fetchOrigin(project, remote, true)
        if (entry.error !== null) {
          return yield* unavailable(`Could not fetch from origin: ${entry.error}`)
        }

        const loaded = yield* load(sessionId)
        if (loaded.status.branch !== branch) {
          return yield* unavailable(
            `This thread works on ${branch}, but the checkout is on ${loaded.status.branch ?? "a detached HEAD"} now. Check out ${branch} again to sync it.`,
          )
        }
        if (loaded.status.entries.some((each) => each.kind === "conflicted")) {
          return yield* unavailable(
            "This folder has unresolved merge conflicts. Resolve them, or ask the agent to, before syncing.",
          )
        }
        const before = yield* describeSync(loaded, true, entry)
        const target = before.target
        if (target === null) {
          return yield* unavailable(
            `${branch} has no upstream, and origin has no ${project.defaultBranch} to update it from.`,
          )
        }

        const head = (yield* git.revParse(cwd, "HEAD")) ?? "HEAD"
        let rebased = false
        if (before.behind > 0 && before.ahead === 0) {
          yield* git.fastForward(cwd, target).pipe(
            Effect.catchTag("GitCommandFailed", (failure) => {
              const paths = overwrittenPaths(failure.stderr)
              return unavailable(
                paths.length === 0
                  ? `Could not bring in ${target}: ${gitProblem(failure)}`
                  : `Nothing was changed: ${target} changes files that have uncommitted changes here (${listPaths(paths, 10)}). Commit them in Commit and push, then sync again.`,
              )
            }),
          )
        } else if (before.behind > 0) {
          const uncommitted = loaded.status.entries.filter((each) => each.kind !== "untracked")
          if (uncommitted.length > 0) {
            return yield* unavailable(
              `${branch} has ${commits(before.ahead)} of its own and ${target} has ${commits(before.behind)} it lacks, so its commits must be replayed on top, which needs a clean folder. Commit the ${files(uncommitted.length)} with changes in Commit and push, then sync again.`,
            )
          }
          const conflicts = yield* git
            .rebase(cwd, target)
            .pipe(
              Effect.catchTag("GitCommandFailed", (failure) =>
                unavailable(`Could not replay ${branch} onto ${target}: ${gitProblem(failure)}`),
              ),
            )
          if (conflicts.length > 0) {
            return yield* unavailable(
              `Nothing was changed: replaying ${branch}'s ${commits(before.ahead)} onto ${target} conflicts in ${listPaths(conflicts, 10)}. Ask the agent to rebase onto ${target} and resolve the conflicts, then sync again.`,
            )
          }
          rebased = true
        }
        const pulled = before.behind
        const changed = pulled > 0 ? yield* git.changedFiles(cwd, head, "HEAD") : []

        let pushed = 0
        const integrated = yield* describeSync(yield* load(sessionId), true, entry)
        if (integrated.pushes && integrated.ahead > 0) {
          yield* git.push(cwd, branch, yield* pushEnv(remote))
          pushed = integrated.ahead
        }

        const after = yield* load(sessionId)
        lastSeen.set(sessionId, {
          branch,
          upstream: after.tracking.upstream,
          ahead: after.tracking.ahead,
        })
        if (pushed > 0) {
          const forgeTarget = targetOf(remote, branch)
          if (forgeTarget !== null) yield* sync.changed(forgeTarget)
        }

        if (pulled > 0) {
          const parts = [`${commits(pulled)} came in, changing ${files(changed.length)}`]
          if (rebased) parts.push(`${branch}'s ${commits(before.ahead)} were replayed on top`)
          if (pushed > 0) parts.push(`${commits(pushed)} pushed`)
          const notice = `Synced ${branch} with ${target}: ${parts.join("; ")}.`
          const agent = `[Humanity] The human synced ${branch} with ${target}: ${commits(pulled)} from the remote are now in ${cwd}${rebased ? `, and ${branch}'s own commits were rebased on top of them` : ""}. ${
            changed.length === 0
              ? "No file changed on disk."
              : `These files changed on disk: ${listPaths(changed, AGENT_FILE_LIST_LIMIT)}. What you read from them before is out of date: read them again before you rely on them or edit them.`
          }`
          yield* Effect.forEach(
            [session, ...sharing],
            (each) => sessions.tell(each.id, { notice, agent }),
            { discard: true },
          )
        } else if (pushed > 0) {
          yield* sessions.tell(session.id, {
            notice: `Pushed ${commits(pushed)} of ${branch} to ${target}.`,
          })
        }

        return {
          status: yield* describeSync(after, true, entry),
          pulled,
          pushed,
          files: changed,
        } satisfies SyncResult
      })

      return PullRequestService.of({
        publication,
        push,
        create,
        merge,
        setOpen,
        setDraft,
        watch,
        refresh,
        syncStatus,
        sync: syncBranch,
      })
    }),
  )
}
