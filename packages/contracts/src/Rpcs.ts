import { ApprovalsRpcs } from "./rpc/Approvals.ts"
import { ClaudeRpcs } from "./rpc/Claude.ts"
import { ExtensionsRpcs } from "./rpc/Extensions.ts"
import { GitRpcs } from "./rpc/Git.ts"
import { GitHubRpcs } from "./rpc/GitHub.ts"
import { PreferencesRpcs } from "./rpc/Preferences.ts"
import { ProjectsRpcs } from "./rpc/Projects.ts"
import { SessionsRpcs } from "./rpc/Sessions.ts"

/** Every RPC the daemon serves, merged into the single group the socket speaks. */
export const HumanityRpcs = ProjectsRpcs.merge(
  GitRpcs,
  GitHubRpcs,
  SessionsRpcs,
  ApprovalsRpcs,
  ClaudeRpcs,
  PreferencesRpcs,
  ExtensionsRpcs,
)

/** Path of the RPC WebSocket on the daemon (and on the Vite dev proxy). */
export const RPC_PATH = "/rpc"

/** Query parameter carrying the daemon auth token on the WebSocket URL. */
export const TOKEN_PARAM = "token"

export const DEFAULT_DAEMON_PORT = 7420
