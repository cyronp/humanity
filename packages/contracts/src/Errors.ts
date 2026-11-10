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
