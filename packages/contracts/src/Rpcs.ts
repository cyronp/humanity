import { AgentClisRpcs } from "./rpc/AgentClis.ts"
import { ApprovalsRpcs } from "./rpc/Approvals.ts"
import { ClaudeRpcs } from "./rpc/Claude.ts"
import { CodexRpcs } from "./rpc/Codex.ts"
import { ExtensionsRpcs } from "./rpc/Extensions.ts"
import { GitRpcs } from "./rpc/Git.ts"
import { GitHubRpcs } from "./rpc/GitHub.ts"
import { GitLabRpcs } from "./rpc/GitLab.ts"
import { KiroRpcs } from "./rpc/Kiro.ts"
import { PreferencesRpcs } from "./rpc/Preferences.ts"
import { ProjectsRpcs } from "./rpc/Projects.ts"
import { PullRequestsRpcs } from "./rpc/PullRequests.ts"
import { SessionsRpcs } from "./rpc/Sessions.ts"
import { UpdatesRpcs } from "./rpc/Updates.ts"

export const HumanityRpcs = ProjectsRpcs.merge(
  GitRpcs,
  GitHubRpcs,
  GitLabRpcs,
  SessionsRpcs,
  ApprovalsRpcs,
  ClaudeRpcs,
  CodexRpcs,
  KiroRpcs,
  PreferencesRpcs,
  ExtensionsRpcs,
  PullRequestsRpcs,
  UpdatesRpcs,
  AgentClisRpcs,
)

export const RPC_PATH = "/rpc"

export const TOKEN_PARAM = "token"

export const DEFAULT_DAEMON_PORT = 7420

export const DEFAULT_DESKTOP_PORT = 7421
