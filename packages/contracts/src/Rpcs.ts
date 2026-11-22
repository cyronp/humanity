import { AgentClisRpcs } from "./rpc/AgentClis.ts"
import { ApprovalsRpcs } from "./rpc/Approvals.ts"
import { ClaudeRpcs } from "./rpc/Claude.ts"
import { CodexRpcs } from "./rpc/Codex.ts"
import { ExtensionsRpcs } from "./rpc/Extensions.ts"
import { FilesRpcs } from "./rpc/Files.ts"
import { GitRpcs } from "./rpc/Git.ts"
import { GitHubRpcs } from "./rpc/GitHub.ts"
import { GitLabRpcs } from "./rpc/GitLab.ts"
import { AntigravityRpcs } from "./rpc/Antigravity.ts"
import { KiroRpcs } from "./rpc/Kiro.ts"
import { PreferencesRpcs } from "./rpc/Preferences.ts"
import { PreviewRpcs } from "./rpc/Preview.ts"
import { ProjectsRpcs } from "./rpc/Projects.ts"
import { PullRequestsRpcs } from "./rpc/PullRequests.ts"
import { SessionsRpcs } from "./rpc/Sessions.ts"
import { SystemRpcs } from "./rpc/System.ts"
import { TerminalsRpcs } from "./rpc/Terminals.ts"
import { UpdatesRpcs } from "./rpc/Updates.ts"

export const HumanityRpcs = ProjectsRpcs.merge(
  GitRpcs,
  GitHubRpcs,
  GitLabRpcs,
  SessionsRpcs,
  FilesRpcs,
  ApprovalsRpcs,
  ClaudeRpcs,
  CodexRpcs,
  KiroRpcs,
  AntigravityRpcs,
  PreferencesRpcs,
  ExtensionsRpcs,
  PullRequestsRpcs,
  UpdatesRpcs,
  AgentClisRpcs,
  TerminalsRpcs,
  PreviewRpcs,
  SystemRpcs,
)

export const RPC_PATH = "/rpc"

export const TOKEN_PARAM = "token"

export const DEFAULT_DAEMON_PORT = 7420

export const DEFAULT_DESKTOP_PORT = 7421
