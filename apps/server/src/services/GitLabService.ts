import {
  type GitLabBranch,
  type GitLabConnection,
  GitLabNotAuthenticated,
  GitLabRateLimited,
  type GitLabRepo,
  GitLabRequestFailed,
  type GitLabUser,
} from "@humanity/contracts"
import { Context, Effect, flow, Layer, Option, Redacted, Schema, Stream } from "effect"
import {
  HttpClient,
  type HttpClientError,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http"
import { nextPageUrl } from "./GitHubService.ts"
import { GitLabToken } from "./GitLabToken.ts"

/** The REST API of the instance at `host`. Always https, so a token never travels in the clear. */
export const gitlabApi = (host: string): string => `https://${host}/api/v4`

export type GitLabError = GitLabNotAuthenticated | GitLabRateLimited | GitLabRequestFailed

/** The token for an instance, and that instance: what a clone needs to authenticate. */
export interface GitLabCredentials {
  readonly host: string
  readonly token: Option.Option<Redacted.Redacted<string>>
}

// Only the fields Humanity uses.
const UserJson = Schema.Struct({
  username: Schema.String,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
})

const RepoJson = Schema.Struct({
  path_with_namespace: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  // Left out of what GitLab shows an anonymous caller, who only ever sees public ones.
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

// GitLab answers `{ message }` (a string, or an object of field errors) or `{ error }`.
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

/** Upper bound for the lists, so a huge instance can't stall the UI. */
const MAX_ITEMS = 1000

const REPOS_PAGE = "/projects?membership=true&archived=false&order_by=last_activity_at&per_page=100"

export class GitLabService extends Context.Service<
  GitLabService,
  {
    /** Which instance, where the token comes from and who it signs in as. A token GitLab refuses is a `problem`, not a failure. */
    readonly connection: (options: { readonly refresh: boolean }) => Effect.Effect<GitLabConnection>
    /** Saves a token and its instance once that instance accepted it; one it rejects is not saved. */
    readonly saveToken: (
      token: string,
      host: string,
    ) => Effect.Effect<GitLabConnection, GitLabError>
    /** Forgets the saved token and reports what is used instead. */
    readonly removeToken: Effect.Effect<GitLabConnection>
    /** Every page of the user's repositories, as a stream that follows `Link: rel="next"`. */
    readonly repos: Stream.Stream<GitLabRepo, GitLabError>
    readonly listRepos: Effect.Effect<ReadonlyArray<GitLabRepo>, GitLabError>
    readonly getRepo: (fullPath: string) => Effect.Effect<GitLabRepo, GitLabError>
    readonly listBranches: (
      fullPath: string,
    ) => Effect.Effect<ReadonlyArray<GitLabBranch>, GitLabError>
    /** The instance in use, and its token for authenticated git operations when there is one. */
    readonly credentials: Effect.Effect<GitLabCredentials>
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

      /** Turns a non-2xx response into the matching tagged error. */
      const checkStatus = (response: HttpClientResponse.HttpClientResponse) =>
        Effect.gen(function* () {
          if (response.status >= 200 && response.status < 300) return response
          if (response.status === 429) {
            const reset = Number(response.headers["ratelimit-reset"])
            return yield* new GitLabRateLimited({
              resetAt:
                Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
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

      /** `path` is relative to the instance's API, so the token can only go to its own instance. */
      const get = (path: string, { host, token }: GitLabCredentials) =>
        http
          .get(`${gitlabApi(host)}${path}`, {
            headers: Option.match(token, {
              onNone: () => ({}),
              onSome: (value) => ({ authorization: `Bearer ${Redacted.value(value)}` }),
            }),
          })
          .pipe(Effect.mapError(transportError), Effect.flatMap(checkStatus))

      const decode =
        <S extends Schema.Constraint>(schema: S) =>
        (response: HttpClientResponse.HttpClientResponse) =>
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

      /** The path of the next page, when the `Link` header names one on this same instance. */
      const nextPath = (response: HttpClientResponse.HttpClientResponse, host: string) => {
        const next = nextPageUrl(response.headers["link"])
        const api = gitlabApi(host)
        return next?.startsWith(`${api}/`) ? Option.some(next.slice(api.length)) : Option.none()
      }

      /** Every page of a list, starting at `first`. */
      const pages = <S extends Schema.Constraint>(
        first: string,
        schema: S,
        using: GitLabCredentials,
      ) =>
        Stream.paginate(first, (path: string) =>
          Effect.gen(function* () {
            const response = yield* get(path, using)
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
          // Asking who it is proves the instance accepts it, before anything is written.
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

      // Public repositories work without a token; private ones need it.
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

      return GitLabService.of({
        connection,
        saveToken,
        removeToken,
        repos,
        listRepos,
        getRepo,
        listBranches,
        credentials,
      })
    }),
  )
}
