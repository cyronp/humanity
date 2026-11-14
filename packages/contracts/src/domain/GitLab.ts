import { Schema } from "effect"

/** The host every GitLab setting falls back to. */
export const GITLAB_DEFAULT_HOST = "gitlab.com"

export const GitLabUser = Schema.Struct({
  username: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
})
export type GitLabUser = typeof GitLabUser.Type

/**
 * Where the token GitLab is called with comes from, in the order they are
 * tried: a token the human saved in Humanity, the GitLab CLI's login, then
 * `GITLAB_TOKEN` in the daemon's environment.
 */
export const GitLabTokenSource = Schema.Literals(["token", "cli", "environment"])
export type GitLabTokenSource = typeof GitLabTokenSource.Type

export const GITLAB_HOST_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::[0-9]{1,5})?$/

/**
 * A GitLab instance as `host` or `host:port`, always reached over https.
 * Nothing but a host name, so it can never carry a path, credentials or a scheme.
 */
export const GitLabHost = Schema.String.check(Schema.isPattern(GITLAB_HOST_PATTERN))

/**
 * The host in what a human or a tool calls a GitLab instance:
 * `https://gitlab.example.com/` and `gitlab.example.com` are the same one.
 * `undefined` when it is not a host at all.
 */
export const normalizeGitLabHost = (input: string): string | undefined => {
  const trimmed = input.trim().replace(/^https?:\/\//i, "")
  // Not a regex: `/+$` retries from every slash, quadratic on a long run of them.
  let end = trimmed.length
  while (end > 0 && trimmed[end - 1] === "/") end--
  const host = trimmed.slice(0, end).toLowerCase()
  return GITLAB_HOST_PATTERN.test(host) ? host : undefined
}

/** How Humanity reaches GitLab right now. */
export const GitLabConnection = Schema.Struct({
  /** The instance in use: gitlab.com or a self-hosted one. The token is only ever sent there. */
  host: Schema.String,
  /** `null` when there is no token at all. */
  source: Schema.NullOr(GitLabTokenSource),
  /** Whether the `glab` command exists on this computer, signed in or not. */
  cliInstalled: Schema.Boolean,
  /** Who the token signs in as. `null` without a token, or when GitLab did not accept it. */
  user: Schema.NullOr(GitLabUser),
  /** Why there is a token but no `user`: rejected, rate limited or GitLab unreachable. */
  problem: Schema.NullOr(Schema.String),
})
export type GitLabConnection = typeof GitLabConnection.Type

/** A GitLab token as pasted by the human: one word, so it can never smuggle a header. */
export const GitLabTokenInput = Schema.String.check(Schema.isPattern(/^\S{1,512}$/))

/** A repository on GitLab, which GitLab itself calls a project. */
export const GitLabRepo = Schema.Struct({
  /** `group/subgroup/name` */
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

/**
 * `group/project` or `group/subgroup/project` as GitLab allows it. No segment
 * can be `.` or `..`, so it is safe as a folder under the data directory.
 */
export const GitLabFullPath = Schema.String.check(Schema.isPattern(GITLAB_FULL_PATH_PATTERN))
