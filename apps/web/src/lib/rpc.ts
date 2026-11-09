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
  /** Branches, status and diff of one project's repository. */
  git: (projectId: string) => `git:${projectId}`,
} as const
