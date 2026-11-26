import {
  type ForgeTerms,
  forgeTerms,
  type MergeMethod,
  type PullRequest,
  type PullRequestCheck,
  type PullRequestComment,
} from "@humanity/contracts"
import { Effect, Option } from "effect"
import { credentialEnv } from "./gitCredentials.ts"
import { type GitHubError, GitHubService } from "./GitHubService.ts"
import { type GitLabError, GitLabService } from "./GitLabService.ts"
import type { LoggedCommit } from "./gitParsers.ts"
import type { PlacedComment } from "./reviewPlacement.ts"

export type ForgeRepo =
  | { readonly forge: "github"; readonly fullName: string }
  | { readonly forge: "gitlab"; readonly host: string; readonly fullPath: string }

export type ForgeError = GitHubError | GitLabError

export interface NewForgePull {
  readonly head: string
  readonly base: string
  readonly title: string
  readonly body: string
  readonly draft: boolean
}

export interface PictureRequest {
  readonly upstream: string | null
  readonly commits: ReadonlyArray<LoggedCommit>
  readonly unpushed: ReadonlySet<string>
  readonly known: (email: string) => boolean
}

export interface FoundPictures {
  readonly bySha: ReadonlyArray<readonly [sha: string, url: string]>
  readonly byEmail: ReadonlyArray<readonly [email: string, url: string | null]>
}

export interface ForgeClient extends ForgeTerms {
  readonly hasToken: Effect.Effect<boolean>
  readonly gitEnv: Effect.Effect<Record<string, string>>
  readonly mergeRefusal: (method: MergeMethod) => string | null
  readonly pictureScope: string
  readonly findPictures: (request: PictureRequest) => Effect.Effect<FoundPictures>
  readonly fallbackPicture: (email: string) => string | null
  readonly find: (branch: string) => Effect.Effect<Option.Option<PullRequest>, ForgeError>
  readonly create: (pull: NewForgePull) => Effect.Effect<PullRequest, ForgeError>
  readonly comment: (pullRequest: PullRequest, body: string) => Effect.Effect<void, ForgeError>
  readonly merge: (
    pullRequest: PullRequest,
    method: MergeMethod,
  ) => Effect.Effect<PullRequest, ForgeError>
  readonly review: (
    pullRequest: PullRequest,
    review: { readonly body: string; readonly comments: ReadonlyArray<PlacedComment> },
  ) => Effect.Effect<void, ForgeError>
  readonly setOpen: (
    pullRequest: PullRequest,
    open: boolean,
  ) => Effect.Effect<PullRequest, ForgeError>
  readonly setDraft: (
    pullRequest: PullRequest,
    draft: boolean,
  ) => Effect.Effect<PullRequest, ForgeError>
  readonly checks: (
    pullRequest: PullRequest,
  ) => Effect.Effect<ReadonlyArray<PullRequestCheck>, ForgeError>
  readonly comments: (
    pullRequest: PullRequest,
  ) => Effect.Effect<ReadonlyArray<PullRequestComment>, ForgeError>
  readonly commitPage: (hash: string) => string
}

const AVATAR_LOOKUPS = 10

const NOREPLY = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/i

export const noreplyAvatar = (email: string): string | null => {
  const match = NOREPLY.exec(email)
  if (match === null) return null
  const [, id, login] = match
  return id !== undefined
    ? `https://avatars.githubusercontent.com/u/${id}?v=4`
    : `https://github.com/${encodeURIComponent(login ?? "")}.png`
}

export const sameHost = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

const NO_PICTURES: FoundPictures = { bySha: [], byEmail: [] }

export const makeForgeClients = Effect.gen(function* () {
  const github = yield* GitHubService
  const gitlab = yield* GitLabService

  const onGitHub = (fullName: string): ForgeClient => ({
    ...forgeTerms("github"),
    hasToken: Effect.map(github.token, Option.isSome),
    gitEnv: Effect.map(github.token, (token) =>
      credentialEnv("https://github.com", "x-access-token", token),
    ),
    mergeRefusal: () => null,
    pictureScope: "github",
    findPictures: ({ upstream, commits, unpushed }) =>
      Effect.gen(function* () {
        const pushed = commits.filter((commit) => !unpushed.has(commit.hash)).length
        const onOrigin = upstream?.startsWith("origin/") === true ? upstream.slice(7) : null
        if (Option.isNone(yield* github.token) || onOrigin === null || pushed === 0) {
          return NO_PICTURES
        }
        const authors = yield* github
          .commitAuthors(fullName, onOrigin, pushed)
          .pipe(Effect.catch(() => Effect.succeed([])))
        const found = authors.flatMap((author) =>
          author.avatarUrl === null ? [] : [{ ...author, avatarUrl: author.avatarUrl }],
        )
        return {
          bySha: found.map((author) => [author.sha, author.avatarUrl] as const),
          byEmail: found.flatMap((author) =>
            author.email === null ? [] : [[author.email, author.avatarUrl] as const],
          ),
        }
      }),
    fallbackPicture: noreplyAvatar,
    find: (branch) => github.findPullRequest(fullName, branch),
    create: (pull) => github.createPullRequest(fullName, pull),
    comment: (pullRequest, body) => github.commentOnPullRequest(fullName, pullRequest.number, body),
    merge: (pullRequest, method) =>
      github.mergePullRequest(fullName, pullRequest.number, { method, sha: pullRequest.headSha }),
    review: (pullRequest, review) =>
      github.reviewPullRequest(fullName, pullRequest.number, {
        commitId: pullRequest.headSha,
        ...review,
      }),
    setOpen: (pullRequest, open) => github.setPullRequestOpen(fullName, pullRequest.number, open),
    setDraft: (pullRequest, draft) =>
      github.setPullRequestDraft(fullName, pullRequest.number, draft),
    checks: (pullRequest) => github.checks(fullName, pullRequest.headSha),
    comments: (pullRequest) => github.comments(fullName, pullRequest.number),
    commitPage: (hash) => `https://github.com/${fullName}/commit/${hash}`,
  })

  const onGitLab = (host: string, fullPath: string): ForgeClient => ({
    ...forgeTerms("gitlab"),
    hasToken: Effect.map(gitlab.credentials, ({ token }) => Option.isSome(token)),
    gitEnv: Effect.map(gitlab.credentials, (connected) =>
      sameHost(connected.host, host)
        ? credentialEnv(`https://${connected.host}`, "oauth2", connected.token)
        : {},
    ),
    mergeRefusal: (method) =>
      method === "rebase"
        ? "GitLab merges by the project's own merge method. Pick Merge or Squash and merge."
        : null,
    pictureScope: `gitlab:${host}`,
    findPictures: ({ commits, known }) =>
      Effect.gen(function* () {
        const { token } = yield* gitlab.credentials
        if (Option.isNone(token)) return NO_PICTURES
        const unknown = [
          ...new Set(commits.map((commit) => commit.authorEmail.toLowerCase())),
        ].filter((email) => email !== "" && !known(email))
        const looked = yield* Effect.forEach(
          unknown.slice(0, AVATAR_LOOKUPS),
          (email) =>
            gitlab.avatar(email).pipe(
              Effect.map((url) => [[email, url] as const]),
              Effect.catch(() => Effect.succeed([])),
            ),
          { concurrency: 3 },
        )
        return { bySha: [], byEmail: looked.flat() }
      }),
    fallbackPicture: () => null,
    find: (branch) => gitlab.findMergeRequest(fullPath, branch),
    create: (pull) =>
      gitlab.createMergeRequest(fullPath, {
        sourceBranch: pull.head,
        targetBranch: pull.base,
        title: pull.title,
        description: pull.body,
        draft: pull.draft,
      }),
    comment: (pullRequest, body) =>
      gitlab.commentOnMergeRequest(fullPath, pullRequest.number, body),
    merge: (pullRequest, method) =>
      gitlab.mergeMergeRequest(fullPath, pullRequest.number, {
        squash: method === "squash",
        sha: pullRequest.headSha,
      }),
    review: (pullRequest, review) =>
      gitlab.reviewMergeRequest(fullPath, pullRequest.number, review),
    setOpen: (pullRequest, open) => gitlab.setMergeRequestOpen(fullPath, pullRequest.number, open),
    setDraft: (pullRequest, draft) => gitlab.setMergeRequestDraft(fullPath, pullRequest, draft),
    checks: (pullRequest) => gitlab.checks(fullPath, pullRequest.number),
    comments: (pullRequest) => gitlab.comments(fullPath, pullRequest),
    commitPage: (hash) => `https://${host}/${fullPath}/-/commit/${hash}`,
  })

  return (repo: ForgeRepo): ForgeClient =>
    repo.forge === "github" ? onGitHub(repo.fullName) : onGitLab(repo.host, repo.fullPath)
})
