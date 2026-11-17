import { RPC_PATH, TOKEN_PARAM, UpdatesRpcs } from "@humanity/contracts"
import { Effect, Layer, Ref } from "effect"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { serveUpdates, type Updater } from "./updates.ts"

export const rpcSocketUrl = (origin: string, token: string): string => {
  const url = new URL(RPC_PATH, origin)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.searchParams.set(TOKEN_PARAM, token)
  return url.toString()
}

export const connectUpdates = (options: {
  readonly origin: string
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

  const opening = Ref.makeUnsafe(true)

  const session = Effect.gen(function* () {
    const client = yield* RpcClient.make(UpdatesRpcs, { flatten: true })
    yield* serveUpdates({
      firstOpen: Ref.getAndSet(opening, false),
      updater: options.updater,
      unsupported: options.unsupported,
      commands: client("Updates.attachDesktop", { version: options.version }),
      report: (state) => Effect.ignore(client("Updates.report", { state })),
    })
  }).pipe(Effect.scoped, Effect.provide(protocol))

  return session.pipe(Effect.ignore, Effect.andThen(Effect.sleep("2 seconds")), Effect.forever)
}
