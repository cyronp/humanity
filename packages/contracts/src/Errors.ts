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

export class GitHubNotAuthenticated extends Schema.TaggedError<GitHubNotAuthenticated>()(
  "GitHubNotAuthenticated",
  { reason: Schema.Literals(["no_token", "rejected"]) },
) {
  override get message() {
    return this.reason === "no_token"
      ? "GitHub is not connected. In Settings, under Repositories, sign in with the GitHub CLI (`gh auth login`) or add a token."
      : "GitHub rejected the token. In Settings, under Repositories, replace it, or run `gh auth login` again."
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

export class GitLabNotAuthenticated extends Schema.TaggedError<GitLabNotAuthenticated>()(
  "GitLabNotAuthenticated",
  { reason: Schema.Literals(["no_token", "rejected"]) },
) {
  override get message() {
    return this.reason === "no_token"
      ? "GitLab is not connected. In Settings, under Repositories, sign in with the GitLab CLI (`glab auth login`) or add a token."
      : "GitLab rejected the token. In Settings, under Repositories, replace it, or run `glab auth login` again."
  }
}

export class GitLabRateLimited extends Schema.TaggedError<GitLabRateLimited>()(
  "GitLabRateLimited",
  { resetAt: Schema.NullOr(Schema.String) },
) {
  override get message() {
    return this.resetAt === null
      ? "GitLab's API rate limit was reached. Try again in a few minutes."
      : `GitLab's API rate limit was reached. It resets at ${new Date(this.resetAt).toLocaleTimeString()}.`
  }
}

export class GitLabRequestFailed extends Schema.TaggedError<GitLabRequestFailed>()(
  "GitLabRequestFailed",
  { status: Schema.Number, detail: Schema.String },
) {
  override get message() {
    if (this.status === 404) return `GitLab could not find that repository (${this.detail}).`
    return this.status === 0
      ? `Could not reach GitLab: ${this.detail}`
      : `GitLab answered ${this.status}: ${this.detail}`
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

export class BranchNotCheckedOut extends Schema.TaggedError<BranchNotCheckedOut>()(
  "BranchNotCheckedOut",
  {
    branch: Schema.String,
    checkedOut: Schema.NullOr(Schema.String),
  },
) {
  override get message() {
    const now = this.checkedOut === null ? "a detached HEAD" : this.checkedOut
    return `This thread works on ${this.branch}, but the checkout is on ${now} now. Check out ${this.branch} again to commit from here.`
  }
}

export class NothingToCommit extends Schema.TaggedError<NothingToCommit>()("NothingToCommit", {
  sessionId: Schema.String,
}) {
  override get message() {
    return "There are no uncommitted changes where this session works."
  }
}

export class PullRequestUnavailable extends Schema.TaggedError<PullRequestUnavailable>()(
  "PullRequestUnavailable",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}

export class SyncUnavailable extends Schema.TaggedError<SyncUnavailable>()("SyncUnavailable", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

export class AccountNotFound extends Schema.TaggedError<AccountNotFound>()("AccountNotFound", {
  accountId: Schema.String,
}) {
  override get message() {
    return "This account does not exist any more. Reload the list of accounts."
  }
}

export class AccountInUse extends Schema.TaggedError<AccountInUse>()("AccountInUse", {
  accountId: Schema.String,
  sessions: Schema.Number,
}) {
  override get message() {
    return this.sessions === 1
      ? "One open thread still runs as this account. End it before removing the account."
      : `${this.sessions} open threads still run as this account. End them before removing the account.`
  }
}

export class AccountNameInvalid extends Schema.TaggedError<AccountNameInvalid>()(
  "AccountNameInvalid",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}

export class AccountFolderInvalid extends Schema.TaggedError<AccountFolderInvalid>()(
  "AccountFolderInvalid",
  { folder: Schema.String, reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}

export class ProviderSwitchUnavailable extends Schema.TaggedError<ProviderSwitchUnavailable>()(
  "ProviderSwitchUnavailable",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}

export class PlanUsageUnavailable extends Schema.TaggedError<PlanUsageUnavailable>()(
  "PlanUsageUnavailable",
  { reason: Schema.String },
) {
  override get message() {
    return `Could not read the plan's usage: ${this.reason}`
  }
}

export class ExtensionInvalid extends Schema.TaggedError<ExtensionInvalid>()("ExtensionInvalid", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

export class ExtensionNotFound extends Schema.TaggedError<ExtensionNotFound>()(
  "ExtensionNotFound",
  { kind: Schema.Literals(["mcp", "skill"]), name: Schema.String },
) {
  override get message() {
    const what = this.kind === "mcp" ? "MCP server" : "skill"
    return `The ${what} "${this.name}" does not exist any more. Reload the settings.`
  }
}

export class UpdatesUnavailable extends Schema.TaggedError<UpdatesUnavailable>()(
  "UpdatesUnavailable",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}

export class CliNotInstalled extends Schema.TaggedError<CliNotInstalled>()("CliNotInstalled", {
  product: Schema.String,
  command: Schema.String,
  installUrl: Schema.String,
}) {
  override get message() {
    return `${this.product} is not installed: no \`${this.command}\` command was found. Install it (${this.installUrl}), then check again.`
  }
}

export class CliUpdateFailed extends Schema.TaggedError<CliUpdateFailed>()("CliUpdateFailed", {
  product: Schema.String,
  command: Schema.String,
  output: Schema.String,
}) {
  override get message() {
    const output = this.output.trim()
    return `\`${this.command}\` did not update ${this.product}.${output === "" ? "" : `\n${output}`}`
  }
}

export class TerminalNotFound extends Schema.TaggedError<TerminalNotFound>()("TerminalNotFound", {
  terminalId: Schema.String,
}) {
  override get message() {
    return "This terminal was closed."
  }
}

export class TerminalSpawnFailed extends Schema.TaggedError<TerminalSpawnFailed>()(
  "TerminalSpawnFailed",
  { shell: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `${this.shell} could not be started: ${this.reason}`
  }
}

export class LocalServerNotFound extends Schema.TaggedError<LocalServerNotFound>()(
  "LocalServerNotFound",
  { pid: Schema.Number, port: Schema.Number },
) {
  override get message() {
    return `Nothing on port ${this.port} is running any more.`
  }
}

export class LocalServerStopFailed extends Schema.TaggedError<LocalServerStopFailed>()(
  "LocalServerStopFailed",
  { port: Schema.Number, reason: Schema.String },
) {
  override get message() {
    return `The server on port ${this.port} could not be stopped: ${this.reason}`
  }
}

export class PreviewFileRefused extends Schema.TaggedError<PreviewFileRefused>()(
  "PreviewFileRefused",
  { path: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `${this.path} can't be previewed: ${this.reason}`
  }
}

export class FolderOpenFailed extends Schema.TaggedError<FolderOpenFailed>()("FolderOpenFailed", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Could not open ${this.path}: ${this.reason}`
  }
}

export class CliPathNotFound extends Schema.TaggedError<CliPathNotFound>()("CliPathNotFound", {
  path: Schema.String,
}) {
  override get message() {
    return `${this.path} is not a file. Pick the CLI's executable or script.`
  }
}

export class FileRefused extends Schema.TaggedError<FileRefused>()("FileRefused", {
  path: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.path}: ${this.reason}`
  }
}

export class FileNotFound extends Schema.TaggedError<FileNotFound>()("FileNotFound", {
  path: Schema.String,
}) {
  override get message() {
    return `${this.path} no longer exists in this thread's folder.`
  }
}

export class FileChangedOnDisk extends Schema.TaggedError<FileChangedOnDisk>()(
  "FileChangedOnDisk",
  { path: Schema.String, version: Schema.NullOr(Schema.String) },
) {
  override get message() {
    return this.version === null
      ? `${this.path} was deleted since you opened it.`
      : `${this.path} changed on disk since you opened it.`
  }
}

export class FileAccessFailed extends Schema.TaggedError<FileAccessFailed>()("FileAccessFailed", {
  path: Schema.String,
  detail: Schema.String,
}) {
  override get message() {
    return `Could not access ${this.path}: ${this.detail}`
  }
}

export class RewindUnavailable extends Schema.TaggedError<RewindUnavailable>()(
  "RewindUnavailable",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason
  }
}
