import { Schema } from "effect"

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()("ProjectNotFound", {
  projectId: Schema.String,
}) {
  override get message() {
    return `Project ${this.projectId} does not exist.`
  }
}

export class ProjectAlreadyExists extends Schema.TaggedError<ProjectAlreadyExists>()(
  "ProjectAlreadyExists",
  { localPath: Schema.String },
) {
  override get message() {
    return `A project for ${this.localPath} was already added.`
  }
}

export class PathNotFound extends Schema.TaggedError<PathNotFound>()("PathNotFound", {
  path: Schema.String,
}) {
  override get message() {
    return `The path ${this.path} does not exist or is not a directory.`
  }
}

export class GitNotARepository extends Schema.TaggedError<GitNotARepository>()(
  "GitNotARepository",
  { path: Schema.String },
) {
  override get message() {
    return `${this.path} is not a git repository. Run "git init" there or pick another folder.`
  }
}

export class GitNotInstalled extends Schema.TaggedError<GitNotInstalled>()("GitNotInstalled", {
  detail: Schema.String,
}) {
  override get message() {
    return `The git CLI could not be started. Install git and make sure it is on PATH. (${this.detail})`
  }
}

export class GitCommandFailed extends Schema.TaggedError<GitCommandFailed>()("GitCommandFailed", {
  args: Schema.Array(Schema.String),
  exitCode: Schema.Number,
  stderr: Schema.String,
}) {
  override get message() {
    const detail = this.stderr.trim() || `exit code ${this.exitCode}`
    return `git ${this.args.join(" ")} failed: ${detail}`
  }
}

export class GitBranchExists extends Schema.TaggedError<GitBranchExists>()("GitBranchExists", {
  name: Schema.String,
}) {
  override get message() {
    return `A branch named "${this.name}" already exists. Pick another name.`
  }
}

export class GitInvalidBranchName extends Schema.TaggedError<GitInvalidBranchName>()(
  "GitInvalidBranchName",
  { name: Schema.String },
) {
  override get message() {
    return `"${this.name}" is not a valid branch name. Avoid spaces, "..", "~", "^", ":" and a leading "-".`
  }
}

export class GitRefNotFound extends Schema.TaggedError<GitRefNotFound>()("GitRefNotFound", {
  ref: Schema.String,
}) {
  override get message() {
    return `The branch or commit "${this.ref}" does not exist in this repository.`
  }
}

export class SessionNotFound extends Schema.TaggedError<SessionNotFound>()("SessionNotFound", {
  sessionId: Schema.String,
}) {
  override get message() {
    return `Session ${this.sessionId} does not exist.`
  }
}

export class SessionEnded extends Schema.TaggedError<SessionEnded>()("SessionEnded", {
  sessionId: Schema.String,
}) {
  override get message() {
    return "This session has ended. Start a new session to keep working."
  }
}

export class AttachmentRejected extends Schema.TaggedError<AttachmentRejected>()(
  "AttachmentRejected",
  { name: Schema.String, reason: Schema.String },
) {
  override get message() {
    return this.name === "" ? this.reason : `${this.name}: ${this.reason}`
  }
}

export class AttachmentNotFound extends Schema.TaggedError<AttachmentNotFound>()(
  "AttachmentNotFound",
  { attachmentId: Schema.String },
) {
  override get message() {
    return "This attachment is no longer stored."
  }
}

export class ApprovalNotFound extends Schema.TaggedError<ApprovalNotFound>()("ApprovalNotFound", {
  id: Schema.String,
}) {
  override get message() {
    return "This approval request no longer exists. The agent may have been interrupted or the daemon restarted."
  }
}

export class ApprovalAlreadyDecided extends Schema.TaggedError<ApprovalAlreadyDecided>()(
  "ApprovalAlreadyDecided",
  { id: Schema.String, status: Schema.String },
) {
  override get message() {
    return `This request was already resolved (${this.status}).`
  }
}

export class IncompleteReview extends Schema.TaggedError<IncompleteReview>()("IncompleteReview", {
  missing: Schema.Array(Schema.Int),
}) {
  override get message() {
    return `Decide every hunk before submitting. Still undecided: ${this.missing.join(", ")}.`
  }
}

export class GitHubNotAuthenticated extends Schema.TaggedError<GitHubNotAuthenticated>()(
  "GitHubNotAuthenticated",
  { reason: Schema.Literals(["no_token", "rejected"]) },
) {
  override get message() {
    return this.reason === "no_token"
      ? "No GitHub token found. Run `gh auth login`, or export GITHUB_TOKEN (a fine-grained token with read access to your repositories), then restart the daemon."
      : "GitHub rejected the token. Run `gh auth login` again or replace GITHUB_TOKEN."
  }
}

export class GitHubRateLimited extends Schema.TaggedError<GitHubRateLimited>()(
  "GitHubRateLimited",
  { resetAt: Schema.NullOr(Schema.String) },
) {
  override get message() {
    return this.resetAt === null
      ? "GitHub's API rate limit was reached. Try again in a few minutes."
      : `GitHub's API rate limit was reached. It resets at ${new Date(this.resetAt).toLocaleTimeString()}.`
  }
}

export class GitHubRequestFailed extends Schema.TaggedError<GitHubRequestFailed>()(
  "GitHubRequestFailed",
  { status: Schema.Number, detail: Schema.String },
) {
  override get message() {
    if (this.status === 404) return `GitHub could not find that repository (${this.detail}).`
    return this.status === 0
      ? `Could not reach GitHub: ${this.detail}`
      : `GitHub answered ${this.status}: ${this.detail}`
  }
}

export class CloneTargetExists extends Schema.TaggedError<CloneTargetExists>()(
  "CloneTargetExists",
  { path: Schema.String },
) {
  override get message() {
    return `${this.path} already exists. Add it as a local project instead, or remove the folder first.`
  }
}

export class SessionBusy extends Schema.TaggedError<SessionBusy>()("SessionBusy", {
  sessionId: Schema.String,
}) {
  override get message() {
    return "The agent is still working. Wait until it is idle, or interrupt it, before committing."
  }
}

export class NothingToCommit extends Schema.TaggedError<NothingToCommit>()("NothingToCommit", {
  sessionId: Schema.String,
}) {
  override get message() {
    return "There are no uncommitted changes where this session works."
  }
}

export class ClaudeAccountNotFound extends Schema.TaggedError<ClaudeAccountNotFound>()(
  "ClaudeAccountNotFound",
  { accountId: Schema.String },
) {
  override get message() {
    return "This account does not exist any more. Reload the list of accounts."
  }
}

export class ClaudeAccountInUse extends Schema.TaggedError<ClaudeAccountInUse>()(
  "ClaudeAccountInUse",
  { accountId: Schema.String, sessions: Schema.Number },
) {
  override get message() {
    return this.sessions === 1
      ? "One open thread still runs as this account. End it before removing the account."
      : `${this.sessions} open threads still run as this account. End them before removing the account.`
  }
}

export class ClaudeAccountNameInvalid extends Schema.TaggedError<ClaudeAccountNameInvalid>()(
  "ClaudeAccountNameInvalid",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}
