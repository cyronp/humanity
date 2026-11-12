import { HumanityRpcs } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { rpcUrl } from "./token.ts"

const Protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
  // The URL is read on every (re)connect, so a token pasted later is picked up.
  Layer.provide(Socket.layerWebSocket(Effect.sync(rpcUrl))),
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
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
  /** How GitHub is reached, and so which repositories it lists. */
  github: "github",
  /** MCP servers and skills: Humanity's own and each repository's. */
  extensions: "extensions",
  /** The human's own choices, like the pinned defaults of new threads. */
  preferences: "preferences",
  /** Branches, status and diff of one project's repository. */
  git: (projectId: string) => `git:${projectId}`,
  /** The session list of one project. */
  sessions: (projectId: string) => `sessions:${projectId}`,
  /** The tool policy of one project. */
  policy: (projectId: string) => `policy:${projectId}`,
  /** Uncommitted changes of one session worktree. */
  sessionDiff: (sessionId: string) => `session-diff:${sessionId}`,
  /** The decision history of one project. */
  history: (projectId: string) => `history:${projectId}`,
} as const
