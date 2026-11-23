import { SessionsRpcs } from "@humanity/contracts"
import { Effect, Layer, Stream } from "effect"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { type Attention, attentionOf, NO_ATTENTION, sameAttention } from "./attention.ts"
import { rpcSocketUrl } from "./updatesClient.ts"

export const watchAttention = (options: {
  readonly origin: string
  readonly readToken: () => string
  readonly onChange: (attention: Attention) => void
}): Effect.Effect<never> => {
  const protocol = RpcClient.layerProtocolSocket().pipe(
    Layer.provide(
      Socket.layerWebSocket(Effect.sync(() => rpcSocketUrl(options.origin, options.readToken()))),
    ),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  )

  let last = NO_ATTENTION
  const publish = (attention: Attention) =>
    Effect.sync(() => {
      if (sameAttention(attention, last)) return
      last = attention
      options.onChange(attention)
    })

  const session = Effect.gen(function* () {
    const client = yield* RpcClient.make(SessionsRpcs, { flatten: true })
    yield* client("Sessions.watchAll", undefined).pipe(
      Stream.map(attentionOf),
      Stream.runForEach(publish),
    )
  }).pipe(Effect.scoped, Effect.provide(protocol))

  return session.pipe(
    Effect.ignore,
    Effect.andThen(publish(NO_ATTENTION)),
    Effect.andThen(Effect.sleep("2 seconds")),
    Effect.forever,
  )
}
