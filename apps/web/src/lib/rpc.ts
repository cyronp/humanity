import { HumanityRpcs } from "@humanity/contracts"
import { Effect, Layer } from "effect"
import { AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { socketStore } from "./connection.ts"
import { rpcUrl } from "./token.ts"

const WatchedWebSocket = Layer.succeed(Socket.WebSocketConstructor)((url, options) => {
  if (options !== undefined && typeof options !== "string" && !Array.isArray(options)) {
    throw new TypeError("The browser's WebSocket takes no client options")
  }
  const socket = new globalThis.WebSocket(url, options)
  socketStore.watch(socket)
  return socket
})

const Protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
  Layer.provide(Socket.layerWebSocket(Effect.sync(rpcUrl))),
  Layer.provide(WatchedWebSocket),
  Layer.provide(RpcSerialization.layerJson),
)

export class HumanityClient extends AtomRpc.Service<HumanityClient>()("HumanityClient", {
  group: HumanityRpcs,
  protocol: Protocol,
}) {}

export const keys = {
  projects: "projects",
  claude: "claude",
  codex: "codex",
  kiro: "kiro",
  antigravity: "antigravity",
  agentCli: (provider: string) => `agent-cli:${provider}`,
  github: "github",
  gitlab: "gitlab",
  extensions: "extensions",
  preferences: "preferences",
  git: (projectId: string) => `git:${projectId}`,
  sessions: (projectId: string) => `sessions:${projectId}`,
  sessionDiff: (sessionId: string) => `session-diff:${sessionId}`,
  sessionCommits: (sessionId: string) => `session-commits:${sessionId}`,
  publication: (sessionId: string) => `publication:${sessionId}`,
  sync: (sessionId: string) => `sync:${sessionId}`,
  history: (projectId: string) => `history:${projectId}`,
} as const
