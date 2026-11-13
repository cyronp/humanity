import {
  type BranchPublication,
  type Forge,
  GITLAB_DEFAULT_HOST,
  type NewPullRequest,
  type Project,
  type ProjectNotFound,
  type PullRequest,
  type PullRequestDetails,
  PullRequestUnavailable,
  type RepoStatus,
  type Session,
  type SessionNotFound,
} from "@humanity/contracts"
import { Context, Effect, Layer, Option } from "effect"
import { credentialEnv } from "./gitCredentials.ts"
import { type GitHubError, GitHubService } from "./GitHubService.ts"
import { type GitLabError, GitLabService } from "./GitLabService.ts"
import { type GitError, GitService, parseGitHubFullName, parseGitLabRemote } from "./GitService.ts"
import { ProjectService } from "./ProjectService.ts"
import { SessionService } from "./SessionService.ts"

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

/** The agent is mid-turn, so the branch may be about to change under the push. */
const isBusy = (session: Session) =>
  session.status === "running" || session.status === "waiting_for_human"

const sameHost = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Publishing a session's branch: push it, open its pull request (a merge
 * request on GitLab), and follow its checks and comments. Everything acts
 * where the session works, on the branch checked out there.
 */
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
    readonly details: (
      sessionId: string,
    ) => Effect.Effect<PullRequestDetails | null, Base | GitHubError | GitLabError>
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

      /** The session, its project and where its branch stands, read fresh. */
      const load = (sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* sessions.get(sessionId)
          const project = yield* projects.get(session.projectId)
          const status = yield* git.status(session.worktreePath)
          const remote = yield* remoteOf(project)
          return { session, project, status, remote }
        })

      const find = (
        remote: Remote,
        branch: string,
      ): Effect.Effect<Option.Option<PullRequest>, GitHubError | GitLabError> =>
        remote.forge === "github"
          ? github.findPullRequest(remote.fullName, branch)
          : gitlab.findMergeRequest(remote.fullPath, branch)

      const describe = (
        project: Project,
        status: RepoStatus,
        remote: Remote | null,
        found: { readonly pullRequest: PullRequest | null; readonly problem: string | null },
      ): BranchPublication => ({
        forge: remote?.forge ?? null,
        branch: status.branch,
        defaultBranch: project.defaultBranch,
        upstream: status.upstream,
        ahead: status.ahead,
        behind: status.behind,
        uncommitted: status.entries.length,
        pullRequest: found.pullRequest,
        problem: found.problem,
      })

      /** The branch's pull request; a forge that can't be asked becomes a `problem`. */
      const lookUp = (remote: Remote | null, branch: string | null) => {
        if (remote === null || branch === null) {
          return Effect.succeed({ pullRequest: null, problem: null })
        }
        if (remote.forge === "gitlab" && remote.mismatch !== null) {
          return Effect.succeed({ pullRequest: null, problem: remote.mismatch })
        }
        return find(remote, branch).pipe(
          Effect.map((found) => ({ pullRequest: Option.getOrNull(found), problem: null })),
          Effect.catch((error) => Effect.succeed({ pullRequest: null, problem: error.message })),
        )
      }

      const publication = Effect.fn("PullRequestService.publication")(function* (
        sessionId: string,
      ) {
        const { project, status, remote } = yield* load(sessionId)
        return describe(project, status, remote, yield* lookUp(remote, status.branch))
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

      const requireBranch = (status: RepoStatus) =>
        status.branch === null
          ? Effect.fail(
              new PullRequestUnavailable({
                reason: "No branch is checked out (detached HEAD). Check out a branch first.",
              }),
            )
          : Effect.succeed(status.branch)

      const push = Effect.fn("PullRequestService.push")(function* (sessionId: string) {
        const { session, project, status, remote } = yield* load(sessionId)
        yield* requireIdle(session)
        const branch = yield* requireBranch(status)
        yield* git.push(session.worktreePath, branch, yield* pushEnv(remote))
        const after = yield* git.status(session.worktreePath)
        return describe(project, after, remote, yield* lookUp(remote, after.branch))
      })

      const forgeName = (forge: Forge) => (forge === "github" ? "pull request" : "merge request")

      const create = Effect.fn("PullRequestService.create")(function* (
        sessionId: string,
        input: NewPullRequest,
      ) {
        const { session, status, remote } = yield* load(sessionId)
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
        const branch = yield* requireBranch(status)
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
        if (status.upstream === null || status.ahead > 0) {
          yield* git.push(session.worktreePath, branch, yield* pushEnv(remote))
        }
        return remote.forge === "github"
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
      })

      const details = Effect.fn("PullRequestService.details")(function* (sessionId: string) {
        const { status, remote } = yield* load(sessionId)
        if (remote === null || status.branch === null) return null
        if (remote.forge === "gitlab" && remote.mismatch !== null) return null
        const pullRequest = Option.getOrNull(yield* find(remote, status.branch))
        if (pullRequest === null) return null
        const [checks, comments] =
          remote.forge === "github"
            ? yield* Effect.all(
                [
                  github.checks(remote.fullName, pullRequest.headSha),
                  github.comments(remote.fullName, pullRequest.number),
                ],
                { concurrency: 2 },
              )
            : yield* Effect.all(
                [
                  gitlab.checks(remote.fullPath, pullRequest.number),
                  gitlab.comments(remote.fullPath, pullRequest),
                ],
                { concurrency: 2 },
              )
        return { pullRequest, checks, comments } satisfies PullRequestDetails
      })

      return PullRequestService.of({ publication, push, create, details })
    }),
  )
}
