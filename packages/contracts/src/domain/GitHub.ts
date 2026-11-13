import { Schema } from "effect"
import { Project } from "./Project.ts"

export const GitHubUser = Schema.Struct({
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  avatarUrl: Schema.String,
})
export type GitHubUser = typeof GitHubUser.Type

/**
 * Where the token GitHub is called with comes from, in the order they are
 * tried: a token the human saved in Humanity, the GitHub CLI's login, then
 * `GITHUB_TOKEN` in the daemon's environment.
 */
export const GitHubTokenSource = Schema.Literals(["token", "cli", "environment"])
export type GitHubTokenSource = typeof GitHubTokenSource.Type

/** How Humanity reaches GitHub right now. */
export const GitHubConnection = Schema.Struct({
  /** `null` when there is no token at all. */
  source: Schema.NullOr(GitHubTokenSource),
  /** Whether the `gh` command exists on this computer, signed in or not. */
  cliInstalled: Schema.Boolean,
  /** Who the token signs in as. `null` without a token, or when GitHub did not accept it. */
  user: Schema.NullOr(GitHubUser),
  /** Why there is a token but no `user`: rejected, rate limited or GitHub unreachable. */
  problem: Schema.NullOr(Schema.String),
})
export type GitHubConnection = typeof GitHubConnection.Type

/** A GitHub token as pasted by the human: one word, so it can never smuggle a header. */
export const GitHubTokenInput = Schema.String.check(Schema.isPattern(/^\S{1,512}$/))

export const GitHubRepo = Schema.Struct({
  /** `owner/name` */
  fullName: Schema.String,
  name: Schema.String,
  owner: Schema.String,
  description: Schema.NullOr(Schema.String),
  private: Schema.Boolean,
  defaultBranch: Schema.String,
  cloneUrl: Schema.String,
  htmlUrl: Schema.String,
  updatedAt: Schema.String,
})
export type GitHubRepo = typeof GitHubRepo.Type

export const GitHubBranch = Schema.Struct({
  name: Schema.String,
  commitSha: Schema.String,
  protected: Schema.Boolean,
})
export type GitHubBranch = typeof GitHubBranch.Type

/** `owner/repo` as GitHub allows it. Anything else never reaches git or the file system. */
export const GitHubFullName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/),
)

/** Streamed by `Projects.cloneFromGitHub`. */
export const CloneEvent = Schema.Union([
  Schema.TaggedStruct("Progress", { line: Schema.String }),
  /** The clone finished and was added as a project. */
  Schema.TaggedStruct("Cloned", { project: Project }),
])
export type CloneEvent = typeof CloneEvent.Type
