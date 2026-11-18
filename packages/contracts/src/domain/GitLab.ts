import { Schema } from "effect"

export const GITLAB_DEFAULT_HOST = "gitlab.com"

export const GitLabUser = Schema.Struct({
  username: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
})
export type GitLabUser = typeof GitLabUser.Type

export const GitLabTokenSource = Schema.Literals(["token", "cli", "environment"])
export type GitLabTokenSource = typeof GitLabTokenSource.Type

export const GITLAB_HOST_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?$/

export const GitLabHost = Schema.String.check(Schema.isPattern(GITLAB_HOST_PATTERN))

export const normalizeGitLabHost = (input: string): string | undefined => {
  const trimmed = input.trim().replace(/^https?:\/\//i, "")
  let end = trimmed.length
  while (end > 0 && trimmed[end - 1] === "/") end--
  const host = trimmed.slice(0, end).toLowerCase()
  return GITLAB_HOST_PATTERN.test(host) ? host : undefined
}

export const GitLabConnection = Schema.Struct({
  host: Schema.String,
  source: Schema.NullOr(GitLabTokenSource),
  cliInstalled: Schema.Boolean,
  user: Schema.NullOr(GitLabUser),
  problem: Schema.NullOr(Schema.String),
})
export type GitLabConnection = typeof GitLabConnection.Type

export const GitLabTokenInput = Schema.String.check(Schema.isPattern(/^\S{1,512}$/))

export const GitLabRepo = Schema.Struct({
  fullPath: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  private: Schema.Boolean,
  cloneUrl: Schema.String,
  webUrl: Schema.String,
  updatedAt: Schema.String,
})
export type GitLabRepo = typeof GitLabRepo.Type

export const GitLabBranch = Schema.Struct({
  name: Schema.String,
  commitSha: Schema.String,
  protected: Schema.Boolean,
})
export type GitLabBranch = typeof GitLabBranch.Type

export const GITLAB_FULL_PATH_PATTERN =
  /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}){1,20}$/

export const GitLabFullPath = Schema.String.check(Schema.isPattern(GITLAB_FULL_PATH_PATTERN))
