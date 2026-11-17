import { HumanityRpcs } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { socketStore } from "./connection.ts"
import { rpcUrl } from "./token.ts"

/** The browser's WebSocket, with each socket reported to `socketStore` so the UI sees a lost daemon. */
const WatchedWebSocket = Layer.succeed(Socket.WebSocketConstructor)((url, options) => {
  if (options !== undefined && typeof options !== "string" && !Array.isArray(options)) {
    throw new TypeError("The browser's WebSocket takes no client options")
  }
  const socket = new globalThis.WebSocket(url, options)
  socketStore.watch(socket)
  return socket
})

const Protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
  // The URL is read on every (re)connect, so a token pasted later is picked up.
  Layer.provide(Socket.layerWebSocket(Effect.sync(rpcUrl))),
  Layer.provide(WatchedWebSocket),
  Layer.provide(RpcSerialization.layerJson),
)

/**
 * The typed RPC client, bound to atoms. All data in the app flows through
 * `HumanityClient.query`, `.mutation` and `.runtime`; routes never fetch.
 */
export class HumanityClient extends AtomRpc.Service<HumanityClient>()("HumanityClient", {
  group: HumanityRpcs,
  protocol: Protocol,
}) {}

/** Reactivity keys: a mutation that names one refreshes every query that names it too. */
export const keys = {
  projects: "projects",
  /** The Claude account sessions run as. */
  claude: "claude",
  /** The Codex login threads on Codex run as. */
  codex: "codex",
  /** The Kiro (Beta) login threads on Kiro run as. */
  kiro: "kiro",
  /** A provider's CLI as installed on this computer: where it is and its version. */
  agentCli: (provider: string) => `agent-cli:${provider}`,
  /** How GitHub is reached, and so which repositories it lists. */
  github: "github",
  /** How GitLab is reached, and so which repositories it lists. */
  gitlab: "gitlab",
  /** MCP servers and skills: Humanity's own and each repository's. */
  extensions: "extensions",
  /** The human's own choices, like the pinned defaults of new threads. */
  preferences: "preferences",
  /** Branches, status and diff of one project's repository. */
  git: (projectId: string) => `git:${projectId}`,
  /** The session list of one project. */
  sessions: (projectId: string) => `sessions:${projectId}`,
  /** Uncommitted changes of one session worktree. */
  sessionDiff: (sessionId: string) => `session-diff:${sessionId}`,
  /** The commits of one session's branch. */
  sessionCommits: (sessionId: string) => `session-commits:${sessionId}`,
  /** Where one session's branch stands against its remote, and its pull request. */
  publication: (sessionId: string) => `publication:${sessionId}`,
  /** The decision history of one project. */
  history: (projectId: string) => `history:${projectId}`,
} as const
