import { RPC_PATH, TOKEN_PARAM, UpdatesRpcs } from "@humanity/contracts"
import { Effect, Layer, Ref } from "effect"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { serveUpdates, type Updater } from "./updates.ts"

/** The daemon's RPC socket, as the page reaches it, with the token in the query. */
export const rpcSocketUrl = (origin: string, token: string): string => {
  const url = new URL(RPC_PATH, origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set(TOKEN_PARAM, token)
  return url.toString()
}

/**
 * Connects to the daemon as one more client and serves its update commands,
 * for as long as the app runs: a daemon that restarts is connected to again.
 */
export const connectUpdates = (options: {
  readonly origin: string
  /** Read on every connect, so a token the daemon writes later is picked up. */
  readonly readToken: () => string
  readonly version: string
  readonly updater: Updater | undefined
  readonly unsupported: string
}): Effect.Effect<never> => {
  const protocol = RpcClient.layerProtocolSocket().pipe(
    Layer.provide(
      Socket.layerWebSocket(Effect.sync(() => rpcSocketUrl(options.origin, options.readToken()))),
    ),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  )

  // Shared by every connection, so only the first one checks on opening.
  const opening = Ref.makeUnsafe(true)

  const session = Effect.gen(function* () {
    const client = yield* RpcClient.make(UpdatesRpcs, { flatten: true })
    yield* serveUpdates({
      firstOpen: Ref.getAndSet(opening, false),
      updater: options.updater,
      unsupported: options.unsupported,
      commands: client("Updates.attachDesktop", { version: options.version }),
      // A report that does not arrive is replaced by the next one.
      report: (state) => Effect.ignore(client("Updates.report", { state })),
    })
  }).pipe(Effect.scoped, Effect.provide(protocol))

  // Whether the daemon went away or ended the stream, connect again shortly.
  return session.pipe(Effect.ignore, Effect.andThen(Effect.sleep("2 seconds")), Effect.forever)
}
