import type { SessionEvent } from "@humanity/contracts"
import { Context, Effect, Layer, PubSub, type Scope } from "effect"

/** One in-process event bus per session. Subscribers only see events published after they subscribe. */
export class SessionEvents extends Context.Service<
  SessionEvents,
  {
    readonly publish: (sessionId: string, event: SessionEvent) => Effect.Effect<void>
    readonly subscribe: (
      sessionId: string,
    ) => Effect.Effect<PubSub.Subscription<SessionEvent>, never, Scope.Scope>
  }
>()("humanity/SessionEvents") {
  static readonly layer = Layer.effect(
    SessionEvents,
    Effect.gen(function* () {
      const hubs = new Map<string, PubSub.PubSub<SessionEvent>>()

      const hub = (sessionId: string) =>
        Effect.gen(function* () {
          const existing = hubs.get(sessionId)
          if (existing !== undefined) return existing
          const created = yield* PubSub.unbounded<SessionEvent>()
          hubs.set(sessionId, created)
          return created
        })

      yield* Effect.addFinalizer(() =>
        Effect.forEach(hubs.values(), (pubsub) => PubSub.shutdown(pubsub), { discard: true }),
      )

      return SessionEvents.of({
        publish: (sessionId, event) =>
          Effect.flatMap(hub(sessionId), (pubsub) => PubSub.publish(pubsub, event)).pipe(
            Effect.asVoid,
          ),
        subscribe: (sessionId) => Effect.flatMap(hub(sessionId), PubSub.subscribe),
      })
    }),
  )
}
