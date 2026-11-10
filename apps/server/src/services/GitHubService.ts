import {
  type GitHubBranch,
  GitHubNotAuthenticated,
  GitHubRateLimited,
  type GitHubRepo,
  GitHubRequestFailed,
  type GitHubUser,
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
    /** Every page of the user's repositories, as a stream that follows `Link: rel="next"`. */
    readonly repos: Stream.Stream<GitHubRepo, GitHubError>
    readonly listRepos: Effect.Effect<ReadonlyArray<GitHubRepo>, GitHubError>
    readonly getRepo: (fullName: string) => Effect.Effect<GitHubRepo, GitHubError>
    readonly listBranches: (
      fullName: string,
    ) => Effect.Effect<ReadonlyArray<GitHubBranch>, GitHubError>
    /** The token for authenticated git operations, when one is available. */
    readonly token: Effect.Effect<Option.Option<Redacted.Redacted<string>>>
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

      const get = (url: string, token: Option.Option<Redacted.Redacted<string>>) =>
        http
          .get(url.startsWith("http") ? url : `${GITHUB_API}${url}`, {
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
                new GitHubRequestFailed({
                  status: response.status,
                  detail: `unexpected response: ${String(error)}`,
                }),
            ),
          )

      const whoami = Effect.gen(function* () {
        const token = yield* requireToken
        const user = yield* get("/user", Option.some(token)).pipe(Effect.flatMap(decode(UserJson)))
        return {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatar_url,
        } satisfies GitHubUser
      })

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

      return GitHubService.of({
        whoami,
        repos,
        listRepos,
        getRepo,
        listBranches,
        token: tokens.get,
      })
    }),
  )
}
