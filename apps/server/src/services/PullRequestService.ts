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

/** Where a project's pull requests live, as far as Humanity can reach them. */
type Remote =
  | { readonly forge: "github"; readonly fullName: string }
  | {
      readonly forge: "gitlab"
      readonly fullPath: string
      readonly host: string
      /** Why the connected instance can't be used for this project, when it can't. */
      readonly mismatch: string | null
    }

/** Where a branch stands against its upstream. */
interface Tracking {
  readonly upstream: string | null
  readonly ahead: number
  readonly behind: number
}

/** The agent is mid-turn, so the branch may be about to change under the push. */
const isBusy = (session: Session) =>
  session.status === "running" || session.status === "waiting_for_human"

const sameHost = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The branch of `remote` the forge can be asked about, when there is one. */
const targetOf = (remote: Remote | null, branch: string | null): ForgeTarget | null => {
  if (remote === null || branch === null) return null
  if (remote.forge === "github") return { forge: "github", fullName: remote.fullName, branch }
  if (remote.mismatch !== null) return null
  return { forge: "gitlab", host: remote.host, fullPath: remote.fullPath, branch }
}

/**
 * Publishing a session's branch: push it, open its pull request (a merge
 * request on GitLab), and follow its checks and comments. Everything acts on
 * the session's own branch, even when another thread has since switched the
 * checkout it shares to another one. Where the branch stands comes from git
 * alone; what the forge says comes through `ForgeSync`,
 * which asks it once for everyone watching.
 */
export class PullRequestService extends Context.Service<
  PullRequestService,
  {
    /** The branch against its remote, read from git: the forge is not asked. */
    readonly publication: (sessionId: string) => Effect.Effect<BranchPublication, Base>
    readonly push: (
      sessionId: string,
    ) => Effect.Effect<BranchPublication, Base | PullRequestUnavailable>
    readonly create: (
      sessionId: string,
      pullRequest: NewPullRequest,
    ) => Effect.Effect<PullRequest, Base | GitHubError | GitLabError | PullRequestUnavailable>
    /** The branch's pull request, checks and comments, kept fresh while the stream runs. */
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
      /** Where each session's branch stood against its remote when last read. */
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
          // A project added before its GitLab instance was connected has no
          // remote on record; its origin still says where it lives.
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

      /**
       * Where `branch` stands against its upstream. The folder's status has it
       * when the branch is checked out there; otherwise its ref is asked.
       */
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

      /** The session, its project, its folder and where the session's branch stands, read fresh. */
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
        // What another branch has uncommitted is that branch's, not this thread's.
        uncommitted: branch === null || branch === status.branch ? status.entries.length : 0,
      })

      /**
       * A branch that reached its remote since it was last read was pushed
       * outside Humanity, most likely by the agent: the forge has news.
       */
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

      /** The token for `origin`'s host, for this one push. */
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
        // A full refspec: it pushes the thread's branch whatever the checkout is on.
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
        // The forge can only open it from a branch it has, at the commit the human sees.
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
            // Nothing to ask: say why once, when there is a why.
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
