import {
  type BranchPublication,
  type Forge,
  GITLAB_DEFAULT_HOST,
  type NewPullRequest,
  type Project,
  type ProjectNotFound,
  type PullRequest,
  type PullRequestFeed,
  PullRequestUnavailable,
  type RepoStatus,
  type Session,
  type SessionNotFound,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option, Stream } from "effect"
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
    readonly watch: (sessionId: string) => Stream.Stream<PullRequestFeed, Base>
    readonly refresh: (sessionId: string) => Effect.Effect<void, Base>
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

      return PullRequestService.of({ publication, push, create, watch, refresh })
    }),
  )
}
