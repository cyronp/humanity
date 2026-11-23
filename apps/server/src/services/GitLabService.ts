import type { PlacedComment } from "./reviewPlacement.ts"
import {
  type CheckStatus,
  type GitLabBranch,
  type GitLabConnection,
  GitLabNotAuthenticated,
  GitLabRateLimited,
  type GitLabRepo,
  GitLabRequestFailed,
  type GitLabUser,
  type PullRequest,
  type PullRequestCheck,
  type PullRequestComment,
} from "@humanity/contracts"
import { Clock, Context, Effect, flow, Layer, Option, Redacted, Schema, Stream } from "effect"
import {
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http"
import {
  type ForgePage,
  forgeScope,
  makeForgeGate,
  quotaFromHeaders,
  retryAfter,
} from "./ForgeGate.ts"
import { nextPageUrl } from "./GitHubService.ts"
import { GitLabToken } from "./GitLabToken.ts"

export const gitlabApi = (host: string): string => `https://${host}/api/v4`

export type GitLabError = GitLabNotAuthenticated | GitLabRateLimited | GitLabRequestFailed

const AvatarJson = Schema.Struct({ avatar_url: Schema.optional(Schema.NullOr(Schema.String)) })

export interface GitLabCredentials {
  readonly host: string
  readonly token: Option.Option<Redacted.Redacted<string>>
}

const UserJson = Schema.Struct({
  username: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
})

const RepoJson = Schema.Struct({
  path_with_namespace: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  visibility: Schema.optional(Schema.String),
  http_url_to_repo: Schema.String,
  web_url: Schema.String,
  last_activity_at: Schema.String,
})

const BranchJson = Schema.Struct({
  name: Schema.String,
  commit: Schema.Struct({ id: Schema.String }),
  protected: Schema.optional(Schema.Boolean),
})

const ErrorJson = Schema.Struct({
  message: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
  error_description: Schema.optional(Schema.Unknown),
})

const errorDetail = (json: typeof ErrorJson.Type): string => {
  for (const value of [json.message, json.error_description, json.error]) {
    if (typeof value === "string" && value !== "") return value
  }
  return json.message === undefined ? "" : JSON.stringify(json.message)
}

const toRepo = (repo: typeof RepoJson.Type): GitLabRepo => ({
  fullPath: repo.path_with_namespace,
  name: repo.name,
  description: repo.description || null,
  private: repo.visibility !== undefined && repo.visibility !== "public",
  cloneUrl: repo.http_url_to_repo,
  webUrl: repo.web_url,
  updatedAt: repo.last_activity_at,
})

const MAX_ITEMS = 1000

const DiffRefsJson = Schema.Struct({
  diff_refs: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        base_sha: Schema.String,
        start_sha: Schema.String,
        head_sha: Schema.String,
      }),
    ),
  ),
})

const MergeRequestJson = Schema.Struct({
  iid: Schema.Int,
  title: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  web_url: Schema.String,
  state: Schema.String,
  draft: Schema.optional(Schema.Boolean),
  work_in_progress: Schema.optional(Schema.Boolean),
  target_branch: Schema.String,
  source_branch: Schema.String,
  sha: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.optional(Schema.NullOr(Schema.Struct({ username: Schema.String }))),
  created_at: Schema.String,
})

const PipelineJson = Schema.Struct({ id: Schema.Int })

const JobJson = Schema.Struct({
  name: Schema.String,
  stage: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.String,
  web_url: Schema.optional(Schema.NullOr(Schema.String)),
  started_at: Schema.optional(Schema.NullOr(Schema.String)),
  finished_at: Schema.optional(Schema.NullOr(Schema.String)),
  allow_failure: Schema.optional(Schema.Boolean),
})

const NoteJson = Schema.Struct({
  id: Schema.Int,
  body: Schema.String,
  author: Schema.Struct({
    username: Schema.String,
    avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  created_at: Schema.String,
  system: Schema.Boolean,
  type: Schema.optional(Schema.NullOr(Schema.String)),
  position: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        new_path: Schema.optional(Schema.NullOr(Schema.String)),
        old_path: Schema.optional(Schema.NullOr(Schema.String)),
        new_line: Schema.optional(Schema.NullOr(Schema.Int)),
        old_line: Schema.optional(Schema.NullOr(Schema.Int)),
      }),
    ),
  ),
})

const toMergeRequest = (mr: typeof MergeRequestJson.Type): PullRequest => ({
  forge: "gitlab",
  number: mr.iid,
  title: mr.title,
  body: mr.description ?? "",
  url: mr.web_url,
  state:
    mr.state === "merged"
      ? "merged"
      : mr.state === "opened"
        ? mr.draft === true || mr.work_in_progress === true
          ? "draft"
          : "open"
        : "closed",
  base: mr.target_branch,
  head: mr.source_branch,
  headSha: mr.sha ?? "",
  author: mr.author?.username ?? "ghost",
  createdAt: mr.created_at,
})

export const gitlabJobStatus = (status: string, allowFailure: boolean): CheckStatus => {
  switch (status) {
    case "success":
      return "success"
    case "failed":
      return allowFailure ? "neutral" : "failure"
    case "running":
      return "running"
    case "canceled":
    case "canceling":
      return "cancelled"
    case "skipped":
      return "skipped"
    case "manual":
      return "neutral"
    default:
      return "queued"
  }
}

export interface NewGitLabMergeRequest {
  readonly sourceBranch: string
  readonly targetBranch: string
  readonly title: string
  readonly description: string
  readonly draft: boolean
}

const DRAFT_PREFIX = /^\s*(?:(?:\[draft\]|\(draft\)|draft:|draft\s+-|\[wip\]|wip:)\s*)+/i

export const draftTitle = (title: string, draft: boolean): string => {
  const bare = title.replace(DRAFT_PREFIX, "")
  return draft ? `Draft: ${bare}` : bare
}

const REPOS_PAGE = "/projects?membership=true&archived=false&order_by=last_activity_at&per_page=100"

export class GitLabService extends Context.Service<
  GitLabService,
  {
    readonly connection: (options: { readonly refresh: boolean }) => Effect.Effect<GitLabConnection>
    readonly saveToken: (
      token: string,
      host: string,
    ) => Effect.Effect<GitLabConnection, GitLabError>
    readonly removeToken: Effect.Effect<GitLabConnection>
    readonly repos: Stream.Stream<GitLabRepo, GitLabError>
    readonly listRepos: Effect.Effect<ReadonlyArray<GitLabRepo>, GitLabError>
    readonly getRepo: (fullPath: string) => Effect.Effect<GitLabRepo, GitLabError>
    readonly listBranches: (
      fullPath: string,
    ) => Effect.Effect<ReadonlyArray<GitLabBranch>, GitLabError>
    readonly credentials: Effect.Effect<GitLabCredentials>
    readonly findMergeRequest: (
      fullPath: string,
      branch: string,
    ) => Effect.Effect<Option.Option<PullRequest>, GitLabError>
    readonly createMergeRequest: (
      fullPath: string,
      mergeRequest: NewGitLabMergeRequest,
    ) => Effect.Effect<PullRequest, GitLabError>
    readonly mergeMergeRequest: (
      fullPath: string,
      iid: number,
      merge: { readonly squash: boolean; readonly sha: string },
    ) => Effect.Effect<PullRequest, GitLabError>
    readonly commentOnMergeRequest: (
      fullPath: string,
      iid: number,
      body: string,
    ) => Effect.Effect<void, GitLabError>
    readonly reviewMergeRequest: (
      fullPath: string,
      iid: number,
      review: { readonly body: string; readonly comments: ReadonlyArray<PlacedComment> },
    ) => Effect.Effect<void, GitLabError>
    readonly setMergeRequestOpen: (
      fullPath: string,
      iid: number,
      open: boolean,
    ) => Effect.Effect<PullRequest, GitLabError>
    readonly setMergeRequestDraft: (
      fullPath: string,
      mergeRequest: PullRequest,
      draft: boolean,
    ) => Effect.Effect<PullRequest, GitLabError>
    readonly checks: (
      fullPath: string,
      iid: number,
    ) => Effect.Effect<ReadonlyArray<PullRequestCheck>, GitLabError>
    readonly comments: (
      fullPath: string,
      mergeRequest: PullRequest,
    ) => Effect.Effect<ReadonlyArray<PullRequestComment>, GitLabError>
    readonly avatar: (email: string) => Effect.Effect<string | null, GitLabError>
  }
>()("humanity/GitLabService") {
  static readonly layer = Layer.effect(
    GitLabService,
    Effect.gen(function* () {
      const tokens = yield* GitLabToken
      const http = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(HttpClientRequest.acceptJson, HttpClientRequest.setHeader("User-Agent", "humanity")),
        ),
      )

      const credentials = Effect.map(tokens.resolve, ({ host, token }): GitLabCredentials => ({
        host,
        token,
      }))

      const requireToken = Effect.flatMap(credentials, ({ host, token }) =>
        Option.match(token, {
          onNone: () => Effect.fail(new GitLabNotAuthenticated({ reason: "no_token" })),
          onSome: (value) => Effect.succeed({ host, token: Option.some(value) }),
        }),
      )

      const gate = yield* makeForgeGate
      const scopeOf = ({ host, token }: GitLabCredentials) => forgeScope(host, token)

      const checkStatus = (response: HttpClientResponse.HttpClientResponse, scope: string) =>
        Effect.gen(function* () {
          if ((response.status >= 200 && response.status < 300) || response.status === 304) {
            yield* gate.answered(scope)
            return response
          }
          if (response.status === 429) {
            const now = yield* Clock.currentTimeMillis
            const reset = Number(response.headers["ratelimit-reset"]) * 1000
            const resumeAt =
              retryAfter(response.headers["retry-after"], now) ??
              (Number.isFinite(reset) && reset > 0 ? reset : undefined)
            yield* gate.limited(scope, resumeAt)
            return yield* new GitLabRateLimited({
              resetAt: resumeAt === undefined ? null : new Date(resumeAt).toISOString(),
            })
          }
          if (response.status === 401) {
            return yield* new GitLabNotAuthenticated({ reason: "rejected" })
          }
          const body = yield* response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(ErrorJson)),
            Effect.map(errorDetail),
            Effect.catch(() => Effect.succeed("")),
          )
          return yield* new GitLabRequestFailed({
            status: response.status,
            detail: body || `request to ${response.request.url} failed`,
          })
        })

      const transportError = (error: HttpClientError.HttpClientError) =>
        new GitLabRequestFailed({ status: 0, detail: error.message })

      const authorization = (token: Option.Option<Redacted.Redacted<string>>) =>
        Option.match(token, {
          onNone: (): Record<string, string> => ({}),
          onSome: (value) => ({ authorization: `Bearer ${Redacted.value(value)}` }),
        })

      const send = (request: HttpClientRequest.HttpClientRequest, using: GitLabCredentials) =>
        Effect.gen(function* () {
          const scope = scopeOf(using)
          const resumeAt = yield* gate.pausedUntil(scope)
          if (resumeAt !== null) {
            return yield* new GitLabRateLimited({ resetAt: new Date(resumeAt).toISOString() })
          }
          const response = yield* gate.withPermit(
            http.execute(request).pipe(Effect.mapError(transportError)),
          )
          yield* gate.observe(scope, quotaFromHeaders(response.headers, "ratelimit-"))
          return yield* checkStatus(response, scope)
        })

      const get = (path: string, using: GitLabCredentials) =>
        send(
          HttpClientRequest.get(`${gitlabApi(using.host)}${path}`, {
            headers: authorization(using.token),
          }),
          using,
        )

      const read = (
        path: string,
        using: GitLabCredentials,
      ): Effect.Effect<ForgePage, GitLabError> =>
        Effect.gen(function* () {
          const key = `${scopeOf(using)}\
${path}`
          const known = gate.recall(key)
          const response = yield* send(
            HttpClientRequest.get(`${gitlabApi(using.host)}${path}`, {
              headers: {
                ...authorization(using.token),
                ...(known === undefined ? {} : { "if-none-match": known.etag }),
              },
            }),
            using,
          )
          if (response.status === 304 && known !== undefined) {
            return { status: 200, headers: { link: known.link }, json: Effect.succeed(known.json) }
          }
          const json = yield* response.json.pipe(
            Effect.mapError(
              (error) =>
                new GitLabRequestFailed({
                  status: response.status,
                  detail: `unexpected response: ${String(error)}`,
                }),
            ),
          )
          const etag = response.headers["etag"]
          const link = response.headers["link"]
          if (etag === undefined) gate.forget(key)
          else gate.remember(key, { etag, json, link })
          return { status: response.status, headers: { link }, json: Effect.succeed(json) }
        })

      const write = (
        method: "POST" | "PUT",
        path: string,
        body: unknown,
        using: GitLabCredentials,
      ) =>
        send(
          HttpClientRequest.make(method)(`${gitlabApi(using.host)}${path}`, {
            headers: authorization(using.token),
          }).pipe(HttpClientRequest.bodyJsonUnsafe(body)),
          using,
        )

      const post = (path: string, body: unknown, using: GitLabCredentials) =>
        write("POST", path, body, using)

      const decode =
        <S extends Schema.Constraint>(schema: S) =>
        (response: Pick<ForgePage, "status" | "json">) =>
          response.json.pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(schema as never)),
            Effect.map((value) => value as S["Type"]),
            Effect.mapError(
              (error) =>
                new GitLabRequestFailed({
                  status: response.status,
                  detail: `unexpected response: ${String(error)}`,
                }),
            ),
          )

      const nextPath = (response: Pick<ForgePage, "headers">, host: string) => {
        const next = nextPageUrl(response.headers["link"])
        const api = gitlabApi(host)
        return next?.startsWith(`${api}/`) ? Option.some(next.slice(api.length)) : Option.none()
      }

      const pages = <S extends Schema.Constraint>(
        first: string,
        schema: S,
        using: GitLabCredentials,
        fetch: (
          path: string,
          using: GitLabCredentials,
        ) => Effect.Effect<ForgePage, GitLabError> = get,
      ) =>
        Stream.paginate(first, (path: string) =>
          Effect.gen(function* () {
            const response = yield* fetch(path, using)
            const page = yield* decode(Schema.Array(schema))(response)
            return [page as ReadonlyArray<S["Type"]>, nextPath(response, using.host)] as const
          }),
        )

      const whoamiWith = (using: GitLabCredentials) =>
        get("/user", using).pipe(
          Effect.flatMap(decode(UserJson)),
          Effect.map((user): GitLabUser => ({
            username: user.username,
            name: user.name ?? null,
            avatarUrl: user.avatar_url ?? null,
          })),
        )

      const connection = (options: { readonly refresh: boolean }) =>
        Effect.gen(function* () {
          if (options.refresh) yield* tokens.invalidate
          const { token, source, host, cliInstalled } = yield* tokens.resolve
          const base = { host, source, cliInstalled }
          if (Option.isNone(token)) {
            return { ...base, user: null, problem: null } satisfies GitLabConnection
          }
          return yield* whoamiWith({ host, token }).pipe(
            Effect.map((user): GitLabConnection => ({ ...base, user, problem: null })),
            Effect.catch((error) =>
              Effect.succeed<GitLabConnection>({ ...base, user: null, problem: error.message }),
            ),
          )
        })

      const saveToken = (token: string, host: string) =>
        Effect.gen(function* () {
          const candidate = Redacted.make(token)
          yield* whoamiWith({ host, token: Option.some(candidate) })
          yield* tokens.save(candidate, host)
          return yield* connection({ refresh: false })
        })

      const removeToken = Effect.andThen(tokens.clear, connection({ refresh: false }))

      const repos = Stream.unwrap(
        Effect.map(requireToken, (using) =>
          pages(REPOS_PAGE, RepoJson, using).pipe(Stream.map(toRepo)),
        ),
      )

      const listRepos = repos.pipe(Stream.take(MAX_ITEMS), Stream.runCollect)

      const getRepo = (fullPath: string) =>
        Effect.gen(function* () {
          const using = yield* credentials
          const repo = yield* get(`/projects/${encodeURIComponent(fullPath)}`, using).pipe(
            Effect.flatMap(decode(RepoJson)),
          )
          return toRepo(repo)
        })

      const listBranches = (fullPath: string) =>
        Effect.gen(function* () {
          const using = yield* credentials
          return yield* pages(
            `/projects/${encodeURIComponent(fullPath)}/repository/branches?per_page=100`,
            BranchJson,
            using,
          ).pipe(
            Stream.map((branch): GitLabBranch => ({
              name: branch.name,
              commitSha: branch.commit.id,
              protected: branch.protected === true,
            })),
            Stream.take(MAX_ITEMS),
            Stream.runCollect,
          )
        })

      const project = (fullPath: string) => `/projects/${encodeURIComponent(fullPath)}`

      const findMergeRequest = (fullPath: string, branch: string) =>
        Effect.gen(function* () {
          const using = yield* credentials
          const mergeRequests = yield* read(
            `${project(fullPath)}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&order_by=updated_at&sort=desc&per_page=20`,
            using,
          ).pipe(Effect.flatMap(decode(Schema.Array(MergeRequestJson))))
          const chosen = mergeRequests.find((mr) => mr.state === "opened") ?? mergeRequests[0]
          return Option.map(Option.fromNullishOr(chosen), toMergeRequest)
        })

      const createMergeRequest = (fullPath: string, mergeRequest: NewGitLabMergeRequest) =>
        Effect.gen(function* () {
          const using = yield* requireToken
          const created = yield* post(
            `${project(fullPath)}/merge_requests`,
            {
              source_branch: mergeRequest.sourceBranch,
              target_branch: mergeRequest.targetBranch,
              title: mergeRequest.draft ? `Draft: ${mergeRequest.title}` : mergeRequest.title,
              description: mergeRequest.description,
            },
            using,
          ).pipe(Effect.flatMap(decode(MergeRequestJson)))
          return toMergeRequest(created)
        })

      const mergeMergeRequest = (
        fullPath: string,
        iid: number,
        merge: { readonly squash: boolean; readonly sha: string },
      ) =>
        Effect.gen(function* () {
          const using = yield* requireToken
          const merged = yield* write(
            "PUT",
            `${project(fullPath)}/merge_requests/${iid}/merge`,
            { squash: merge.squash, sha: merge.sha },
            using,
          ).pipe(Effect.flatMap(decode(MergeRequestJson)))
          return toMergeRequest(merged)
        })

      const commentOnMergeRequest = (fullPath: string, iid: number, body: string) =>
        Effect.gen(function* () {
          const using = yield* requireToken
          yield* post(`${project(fullPath)}/merge_requests/${iid}/notes`, { body }, using)
        })

      const reviewMergeRequest = (
        fullPath: string,
        iid: number,
        review: { readonly body: string; readonly comments: ReadonlyArray<PlacedComment> },
      ) =>
        Effect.gen(function* () {
          const using = yield* requireToken
          const refs = yield* read(`${project(fullPath)}/merge_requests/${iid}`, using).pipe(
            Effect.flatMap(decode(DiffRefsJson)),
          )
          if (refs.diff_refs == null) {
            return yield* new GitLabRequestFailed({
              status: 200,
              detail: "GitLab did not say which commits the merge request compares.",
            })
          }
          const { base_sha, start_sha, head_sha } = refs.diff_refs
          for (const comment of review.comments) {
            yield* post(
              `${project(fullPath)}/merge_requests/${iid}/discussions`,
              {
                body: comment.body,
                position: {
                  position_type: "text",
                  base_sha,
                  start_sha,
                  head_sha,
                  old_path: comment.previousPath,
                  new_path: comment.path,
                  ...(comment.oldLine === undefined ? {} : { old_line: comment.oldLine }),
                  ...(comment.newLine === undefined ? {} : { new_line: comment.newLine }),
                },
              },
              using,
            )
          }
          const body = review.body.trim()
          if (body !== "") {
            yield* post(`${project(fullPath)}/merge_requests/${iid}/notes`, { body }, using)
          }
        })

      const updateMergeRequest = (fullPath: string, iid: number, body: unknown) =>
        Effect.gen(function* () {
          const using = yield* requireToken
          const updated = yield* write(
            "PUT",
            `${project(fullPath)}/merge_requests/${iid}`,
            body,
            using,
          ).pipe(Effect.flatMap(decode(MergeRequestJson)))
          return toMergeRequest(updated)
        })

      const setMergeRequestOpen = (fullPath: string, iid: number, open: boolean) =>
        updateMergeRequest(fullPath, iid, { state_event: open ? "reopen" : "close" })

      const setMergeRequestDraft = (fullPath: string, mergeRequest: PullRequest, draft: boolean) =>
        updateMergeRequest(fullPath, mergeRequest.number, {
          title: draftTitle(mergeRequest.title, draft),
        })

      const checks = (fullPath: string, iid: number) =>
        Effect.gen(function* () {
          const using = yield* credentials
          const pipelines = yield* read(
            `${project(fullPath)}/merge_requests/${iid}/pipelines?per_page=1`,
            using,
          ).pipe(Effect.flatMap(decode(Schema.Array(PipelineJson))))
          const latest = pipelines[0]
          if (latest === undefined) return []
          const jobs = yield* pages(
            `${project(fullPath)}/pipelines/${latest.id}/jobs?per_page=100`,
            JobJson,
            using,
            read,
          ).pipe(Stream.take(MAX_ITEMS), Stream.runCollect)
          return jobs.map((job): PullRequestCheck => ({
            name: job.name,
            status: gitlabJobStatus(job.status, job.allow_failure === true),
            description: job.stage ?? null,
            url: job.web_url ?? null,
            startedAt: job.started_at ?? null,
            finishedAt: job.finished_at ?? null,
          }))
        })

      const avatar = (email: string) =>
        Effect.gen(function* () {
          const using = yield* credentials
          const found = yield* read(
            `/avatar?email=${encodeURIComponent(email)}&size=48`,
            using,
          ).pipe(Effect.flatMap(decode(AvatarJson)))
          return found.avatar_url ?? null
        })

      const comments = (fullPath: string, mergeRequest: PullRequest) =>
        Effect.gen(function* () {
          const using = yield* credentials
          const notes = yield* pages(
            `${project(fullPath)}/merge_requests/${mergeRequest.number}/notes?sort=asc&order_by=created_at&per_page=100`,
            NoteJson,
            using,
            read,
          ).pipe(Stream.take(MAX_ITEMS), Stream.runCollect)
          return notes
            .filter((note) => !note.system)
            .map((note): PullRequestComment => {
              const position = note.type === "DiffNote" ? note.position : null
              return {
                id: `note-${note.id}`,
                kind: position ? "inline" : "comment",
                author: note.author.username,
                avatarUrl: note.author.avatar_url ?? null,
                body: note.body,
                createdAt: note.created_at,
                url: `${mergeRequest.url}#note_${note.id}`,
                path: position ? (position.new_path ?? position.old_path ?? null) : null,
                line: position ? (position.new_line ?? position.old_line ?? null) : null,
                reviewState: null,
              }
            })
        })

      return GitLabService.of({
        connection,
        saveToken,
        removeToken,
        repos,
        listRepos,
        getRepo,
        listBranches,
        credentials,
        findMergeRequest,
        createMergeRequest,
        mergeMergeRequest,
        commentOnMergeRequest,
        reviewMergeRequest,
        setMergeRequestOpen,
        setMergeRequestDraft,
        checks,
        comments,
        avatar,
      })
    }),
  )
}
