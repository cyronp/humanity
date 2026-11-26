import {
  type ForgeTerms,
  forgeTerms,
  type MergeMethod,
  type PullRequest,
  type PullRequestCheck,
  type PullRequestComment,
} from "@humanity/contracts"
import { Effect, Option } from "effect"
import { type GitHubError, GitHubService } from "./GitHubService.ts"
import { type GitLabError, GitLabService } from "./GitLabService.ts"
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

export interface ForgeClient extends ForgeTerms {
  readonly hasToken: Effect.Effect<boolean>
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

export const makeForgeClients = Effect.gen(function* () {
  const github = yield* GitHubService
  const gitlab = yield* GitLabService

  const onGitHub = (fullName: string): ForgeClient => ({
    ...forgeTerms("github"),
    hasToken: Effect.map(github.token, Option.isSome),
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
