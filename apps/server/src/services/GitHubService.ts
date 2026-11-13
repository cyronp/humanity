import {
  type CheckStatus,
  type GitHubBranch,
  type GitHubConnection,
  GitHubNotAuthenticated,
  GitHubRateLimited,
  type GitHubRepo,
  GitHubRequestFailed,
  type GitHubUser,
  type PullRequest,
  type PullRequestCheck,
  type PullRequestComment,
} from "@humanity/contracts"
import { Context, Effect, flow, Layer, Option, Redacted, Schema, Stream } from "effect"
import {
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http"
import { GitHubToken } from "./GitHubToken.ts"

export const GITHUB_API = "https://api.github.com"

export type GitHubError = GitHubNotAuthenticated | GitHubRateLimited | GitHubRequestFailed

// Only the fields Humanity uses.
const UserJson = Schema.Struct({
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatar_url: Schema.String,
})

const RepoJson = Schema.Struct({
  full_name: Schema.String,
  name: Schema.String,
  owner: Schema.Struct({ login: Schema.String }),
  description: Schema.NullOr(Schema.String),
  private: Schema.Boolean,
  default_branch: Schema.String,
  clone_url: Schema.String,
  html_url: Schema.String,
  updated_at: Schema.String,
})

const BranchJson = Schema.Struct({
  name: Schema.String,
  commit: Schema.Struct({ sha: Schema.String }),
  protected: Schema.optional(Schema.Boolean),
})

const ErrorJson = Schema.Struct({ message: Schema.optional(Schema.String) })

const PullJson = Schema.Struct({
  number: Schema.Int,
  title: Schema.String,
  body: Schema.NullOr(Schema.String),
  html_url: Schema.String,
  state: Schema.String,
  draft: Schema.optional(Schema.Boolean),
  merged_at: Schema.NullOr(Schema.String),
  base: Schema.Struct({ ref: Schema.String }),
  head: Schema.Struct({ ref: Schema.String, sha: Schema.String }),
  user: Schema.NullOr(Schema.Struct({ login: Schema.String })),
  created_at: Schema.String,
})

const AuthorJson = Schema.NullOr(Schema.Struct({ login: Schema.String, avatar_url: Schema.String }))

const CheckRunsJson = Schema.Struct({
  check_runs: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      status: Schema.String,
      conclusion: Schema.NullOr(Schema.String),
      html_url: Schema.NullOr(Schema.String),
      details_url: Schema.optional(Schema.NullOr(Schema.String)),
      started_at: Schema.NullOr(Schema.String),
      completed_at: Schema.NullOr(Schema.String),
      output: Schema.optional(
        Schema.Struct({ title: Schema.optional(Schema.NullOr(Schema.String)) }),
      ),
    }),
  ),
})

const CombinedStatusJson = Schema.Struct({
  statuses: Schema.Array(
    Schema.Struct({
      context: Schema.String,
      state: Schema.String,
      description: Schema.NullOr(Schema.String),
      target_url: Schema.NullOr(Schema.String),
      created_at: Schema.String,
      updated_at: Schema.String,
    }),
  ),
})

const IssueCommentJson = Schema.Struct({
  id: Schema.Number,
  user: AuthorJson,
  body: Schema.optional(Schema.NullOr(Schema.String)),
  created_at: Schema.String,
  html_url: Schema.String,
})

const ReviewCommentJson = Schema.Struct({
  id: Schema.Number,
  user: AuthorJson,
  body: Schema.String,
  created_at: Schema.String,
  html_url: Schema.String,
  path: Schema.String,
  line: Schema.optional(Schema.NullOr(Schema.Int)),
  original_line: Schema.optional(Schema.NullOr(Schema.Int)),
})

const ReviewJson = Schema.Struct({
  id: Schema.Number,
  user: AuthorJson,
  body: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.String,
  submitted_at: Schema.optional(Schema.NullOr(Schema.String)),
  html_url: Schema.String,
})

const toPullRequest = (pull: typeof PullJson.Type): PullRequest => ({
  forge: "github",
  number: pull.number,
  title: pull.title,
  body: pull.body ?? "",
  url: pull.html_url,
  state:
    pull.merged_at !== null
      ? "merged"
      : pull.state === "closed"
        ? "closed"
        : pull.draft === true
          ? "draft"
          : "open",
  base: pull.base.ref,
  head: pull.head.ref,
  headSha: pull.head.sha,
  author: pull.user?.login ?? "ghost",
  createdAt: pull.created_at,
})

/** A check run's status and conclusion, as one status. */
export const githubCheckRunStatus = (status: string, conclusion: string | null): CheckStatus => {
  if (status !== "completed") return status === "in_progress" ? "running" : "queued"
  switch (conclusion) {
    case "success":
      return "success"
    case "failure":
    case "timed_out":
    case "action_required":
    case "startup_failure":
      return "failure"
    case "cancelled":
      return "cancelled"
    case "skipped":
      return "skipped"
    default:
      return "neutral"
  }
}

/** A commit status's state (`error`, `failure`, `pending`, `success`), as a check status. */
export const githubCommitStatus = (state: string): CheckStatus =>
  state === "success"
    ? "success"
    : state === "pending"
      ? "running"
      : state === "failure" || state === "error"
        ? "failure"
        : "neutral"

const authorOf = (user: typeof AuthorJson.Type) => ({
  author: user?.login ?? "ghost",
  avatarUrl: user?.avatar_url ?? null,
})

/** How many items one list of a pull request may hold, so a huge one can't stall the UI. */
const MAX_PULL_ITEMS = 500

export interface NewGitHubPull {
  readonly head: string
  readonly base: string
  readonly title: string
  readonly body: string
  readonly draft: boolean
}

const toRepo = (repo: typeof RepoJson.Type): GitHubRepo => ({
  fullName: repo.full_name,
  name: repo.name,
  owner: repo.owner.login,
  description: repo.description,
  private: repo.private,
  defaultBranch: repo.default_branch,
  cloneUrl: repo.clone_url,
  htmlUrl: repo.html_url,
  updatedAt: repo.updated_at,
})

/** The `next` URL from a `Link` header, if there is one. */
export const nextPageUrl = (link: string | undefined): string | undefined => {
  if (link === undefined) return undefined
  for (const part of link.split(",")) {
    const match = /<([^>]+)>\s*;\s*rel="?next"?/.exec(part)
    if (match?.[1] !== undefined) return match[1]
  }
  return undefined
}

/** Upper bound for `listRepos`, so a huge organization can't stall the UI. */
const MAX_REPOS = 1000

export class GitHubService extends Context.Service<
  GitHubService,
  {
    readonly whoami: Effect.Effect<GitHubUser, GitHubError>
    /** Where the token comes from and who it signs in as. A token GitHub refuses is a `problem`, not a failure. */
    readonly connection: (options: { readonly refresh: boolean }) => Effect.Effect<GitHubConnection>
    /** Saves a token once GitHub accepted it; one it rejects is not saved. */
    readonly saveToken: (token: string) => Effect.Effect<GitHubConnection, GitHubError>
    /** Forgets the saved token and reports what is used instead. */
    readonly removeToken: Effect.Effect<GitHubConnection>
    /** Every page of the user's repositories, as a stream that follows `Link: rel="next"`. */
    readonly repos: Stream.Stream<GitHubRepo, GitHubError>
    readonly listRepos: Effect.Effect<ReadonlyArray<GitHubRepo>, GitHubError>
    readonly getRepo: (fullName: string) => Effect.Effect<GitHubRepo, GitHubError>
    readonly listBranches: (
      fullName: string,
    ) => Effect.Effect<ReadonlyArray<GitHubBranch>, GitHubError>
    /** The token for authenticated git operations, when one is available. */
    readonly token: Effect.Effect<Option.Option<Redacted.Redacted<string>>>
    /** `branch`'s open pull request in `fullName`, else its most recently updated one. */
    readonly findPullRequest: (
      fullName: string,
      branch: string,
    ) => Effect.Effect<Option.Option<PullRequest>, GitHubError>
    readonly createPullRequest: (
      fullName: string,
      pull: NewGitHubPull,
    ) => Effect.Effect<PullRequest, GitHubError>
    /** The check runs and commit statuses of `sha`. */
    readonly checks: (
      fullName: string,
      sha: string,
    ) => Effect.Effect<ReadonlyArray<PullRequestCheck>, GitHubError>
    /** Conversation comments, reviews with something to say and inline comments, oldest first. */
    readonly comments: (
      fullName: string,
      number: number,
    ) => Effect.Effect<ReadonlyArray<PullRequestComment>, GitHubError>
  }
>()("humanity/GitHubService") {
  static readonly layer = Layer.effect(
    GitHubService,
    Effect.gen(function* () {
      const tokens = yield* GitHubToken
      const http = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(
            HttpClientRequest.acceptJson,
            HttpClientRequest.setHeader("X-GitHub-Api-Version", "2022-11-28"),
            HttpClientRequest.setHeader("User-Agent", "humanity"),
          ),
        ),
      )

      const requireToken = Effect.flatMap(tokens.get, (token) =>
        Option.match(token, {
          onNone: () => Effect.fail(new GitHubNotAuthenticated({ reason: "no_token" })),
          onSome: Effect.succeed,
        }),
      )

      /** Turns a non-2xx response into the matching tagged error. */
      const checkStatus = (response: HttpClientResponse.HttpClientResponse) =>
        Effect.gen(function* () {
          if (response.status >= 200 && response.status < 300) return response
          const remaining = response.headers["x-ratelimit-remaining"]
          if ((response.status === 403 || response.status === 429) && remaining === "0") {
            const reset = Number(response.headers["x-ratelimit-reset"])
            return yield* new GitHubRateLimited({
              resetAt: Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null,
            })
          }
          if (response.status === 429) return yield* new GitHubRateLimited({ resetAt: null })
          if (response.status === 401) {
            return yield* new GitHubNotAuthenticated({ reason: "rejected" })
          }
          const body = yield* response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(ErrorJson)),
            Effect.map((json) => json.message ?? ""),
            Effect.catch(() => Effect.succeed("")),
          )
          return yield* new GitHubRequestFailed({
            status: response.status,
            detail: body || `request to ${response.request.url} failed`,
          })
        })

      const transportError = (error: HttpClientError.HttpClientError) =>
        new GitHubRequestFailed({ status: 0, detail: error.message })

      const authorization = (token: Option.Option<Redacted.Redacted<string>>) =>
        Option.match(token, {
          onNone: (): Record<string, string> => ({}),
          onSome: (value) => ({ authorization: `Bearer ${Redacted.value(value)}` }),
        })

      const get = (url: string, token: Option.Option<Redacted.Redacted<string>>) =>
        http
          .get(url.startsWith("http") ? url : `${GITHUB_API}${url}`, {
            headers: authorization(token),
          })
          .pipe(Effect.mapError(transportError), Effect.flatMap(checkStatus))

      const post = (path: string, body: unknown, token: Redacted.Redacted<string>) =>
        http
          .execute(
            HttpClientRequest.post(`${GITHUB_API}${path}`, {
              headers: authorization(Option.some(token)),
            }).pipe(HttpClientRequest.bodyJsonUnsafe(body)),
          )
          .pipe(Effect.mapError(transportError), Effect.flatMap(checkStatus))

      const decode =
        <S extends Schema.Constraint>(schema: S) =>
        (response: HttpClientResponse.HttpClientResponse) =>
          response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(schema as never)),
            Effect.map((value) => value as S["Type"]),
            Effect.mapError(
              (error) =>
                new GitHubRequestFailed({
                  status: response.status,
                  detail: `unexpected response: ${String(error)}`,
                }),
            ),
          )

      const whoamiWith = (token: Redacted.Redacted<string>) =>
        get("/user", Option.some(token)).pipe(
          Effect.flatMap(decode(UserJson)),
          Effect.map((user): GitHubUser => ({
            login: user.login,
            name: user.name,
            avatarUrl: user.avatar_url,
          })),
        )

      const whoami = Effect.flatMap(requireToken, whoamiWith)

      const connection = (options: { readonly refresh: boolean }) =>
        Effect.gen(function* () {
          if (options.refresh) yield* tokens.invalidate
          const { token, source, cliInstalled } = yield* tokens.resolve
          if (Option.isNone(token)) {
            return { source, cliInstalled, user: null, problem: null } satisfies GitHubConnection
          }
          return yield* whoamiWith(token.value).pipe(
            Effect.map((user): GitHubConnection => ({ source, cliInstalled, user, problem: null })),
            Effect.catch((error) =>
              Effect.succeed<GitHubConnection>({
                source,
                cliInstalled,
                user: null,
                problem: error.message,
              }),
            ),
          )
        })

      const saveToken = (token: string) =>
        Effect.gen(function* () {
          const candidate = Redacted.make(token)
          // Asking who it is proves GitHub accepts it, before anything is written.
          yield* whoamiWith(candidate)
          yield* tokens.save(candidate)
          return yield* connection({ refresh: false })
        })

      const removeToken = Effect.andThen(tokens.clear, connection({ refresh: false }))

      const repos = Stream.unwrap(
        Effect.map(requireToken, (token) =>
          Stream.paginate(
            "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
            (url: string) =>
              Effect.gen(function* () {
                const response = yield* get(url, Option.some(token))
                const page = yield* decode(Schema.Array(RepoJson))(response)
                const next = nextPageUrl(response.headers["link"])
                return [page.map(toRepo), Option.fromNullishOr(next)] as const
              }),
          ),
        ),
      )

      const listRepos = repos.pipe(Stream.take(MAX_REPOS), Stream.runCollect)

      // Public repositories work without a token; private ones need it.
      const getRepo = (fullName: string) =>
        Effect.gen(function* () {
          const token = yield* tokens.get
          const repo = yield* get(`/repos/${fullName}`, token).pipe(
            Effect.flatMap(decode(RepoJson)),
          )
          return toRepo(repo)
        })

      const listBranches = (fullName: string) =>
        Effect.gen(function* () {
          const token = yield* tokens.get
          return yield* Stream.paginate(`/repos/${fullName}/branches?per_page=100`, (url: string) =>
            Effect.gen(function* () {
              const response = yield* get(url, token)
              const page = yield* decode(Schema.Array(BranchJson))(response)
              const next = nextPageUrl(response.headers["link"])
              return [
                page.map((branch): GitHubBranch => ({
                  name: branch.name,
                  commitSha: branch.commit.sha,
                  protected: branch.protected === true,
                })),
                Option.fromNullishOr(next),
              ] as const
            }),
          ).pipe(Stream.take(MAX_REPOS), Stream.runCollect)
        })

      /** Every page of a list, up to `MAX_PULL_ITEMS` items. */
      const all = <S extends Schema.Constraint>(
        first: string,
        schema: S,
        token: Option.Option<Redacted.Redacted<string>>,
      ) =>
        Stream.paginate(first, (url: string) =>
          Effect.gen(function* () {
            const response = yield* get(url, token)
            const page = yield* decode(Schema.Array(schema))(response)
            const next = nextPageUrl(response.headers["link"])
            return [page as ReadonlyArray<S["Type"]>, Option.fromNullishOr(next)] as const
          }),
        ).pipe(Stream.take(MAX_PULL_ITEMS), Stream.runCollect)

      const findPullRequest = (fullName: string, branch: string) =>
        Effect.gen(function* () {
          const token = yield* tokens.get
          const owner = fullName.split("/")[0] ?? ""
          const head = encodeURIComponent(`${owner}:${branch}`)
          const pulls = yield* get(
            `/repos/${fullName}/pulls?head=${head}&state=all&sort=updated&direction=desc&per_page=20`,
            token,
          ).pipe(Effect.flatMap(decode(Schema.Array(PullJson))))
          const chosen = pulls.find((pull) => pull.state === "open") ?? pulls[0]
          return Option.map(Option.fromNullishOr(chosen), toPullRequest)
        })

      const createPullRequest = (fullName: string, pull: NewGitHubPull) =>
        Effect.gen(function* () {
          const token = yield* requireToken
          const created = yield* post(`/repos/${fullName}/pulls`, pull, token).pipe(
            Effect.flatMap(decode(PullJson)),
          )
          return toPullRequest(created)
        })

      const checks = (fullName: string, sha: string) =>
        Effect.gen(function* () {
          const token = yield* tokens.get
          const [runs, combined] = yield* Effect.all(
            [
              get(`/repos/${fullName}/commits/${sha}/check-runs?per_page=100`, token).pipe(
                Effect.flatMap(decode(CheckRunsJson)),
              ),
              get(`/repos/${fullName}/commits/${sha}/status?per_page=100`, token).pipe(
                Effect.flatMap(decode(CombinedStatusJson)),
              ),
            ],
            { concurrency: 2 },
          )
          const fromRuns = runs.check_runs.map((run): PullRequestCheck => ({
            name: run.name,
            status: githubCheckRunStatus(run.status, run.conclusion),
            description: run.output?.title ?? null,
            url: run.html_url ?? run.details_url ?? null,
            startedAt: run.started_at,
            finishedAt: run.completed_at,
          }))
          const fromStatuses = combined.statuses.map((status): PullRequestCheck => ({
            name: status.context,
            status: githubCommitStatus(status.state),
            description: status.description,
            url: status.target_url,
            startedAt: status.created_at,
            finishedAt: status.state === "pending" ? null : status.updated_at,
          }))
          return [...fromRuns, ...fromStatuses]
        })

      const comments = (fullName: string, number: number) =>
        Effect.gen(function* () {
          const token = yield* tokens.get
          const base = `/repos/${fullName}`
          const [conversation, inline, reviews] = yield* Effect.all(
            [
              all(`${base}/issues/${number}/comments?per_page=100`, IssueCommentJson, token),
              all(`${base}/pulls/${number}/comments?per_page=100`, ReviewCommentJson, token),
              all(`${base}/pulls/${number}/reviews?per_page=100`, ReviewJson, token),
            ],
            { concurrency: 3 },
          )
          const result: Array<PullRequestComment> = [
            ...conversation.map((comment): PullRequestComment => ({
              id: `issue-${comment.id}`,
              kind: "comment",
              ...authorOf(comment.user),
              body: comment.body ?? "",
              createdAt: comment.created_at,
              url: comment.html_url,
              path: null,
              line: null,
              reviewState: null,
            })),
            ...inline.map((comment): PullRequestComment => ({
              id: `inline-${comment.id}`,
              kind: "inline",
              ...authorOf(comment.user),
              body: comment.body,
              createdAt: comment.created_at,
              url: comment.html_url,
              path: comment.path,
              line: comment.line ?? comment.original_line ?? null,
              reviewState: null,
            })),
            // A bare "commented" review only wraps its inline comments, listed above;
            // a pending one is a draft only its author sees.
            ...reviews
              .filter((review) => review.state !== "PENDING")
              .filter((review) => (review.body ?? "") !== "" || review.state !== "COMMENTED")
              .map((review): PullRequestComment => ({
                id: `review-${review.id}`,
                kind: "review",
                ...authorOf(review.user),
                body: review.body ?? "",
                createdAt: review.submitted_at ?? "",
                url: review.html_url,
                path: null,
                line: null,
                reviewState: review.state.toLowerCase(),
              })),
          ]
          return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        })

      return GitHubService.of({
        whoami,
        connection,
        saveToken,
        removeToken,
        repos,
        listRepos,
        getRepo,
        listBranches,
        token: tokens.get,
        findPullRequest,
        createPullRequest,
        checks,
        comments,
      })
    }),
  )
}
