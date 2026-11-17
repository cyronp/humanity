import {
  type DesktopUpdateCommand,
  type UpdatePreferences,
  type UpdateState,
  type UpdateStatus,
  UpdatesUnavailable,
} from "@humanity/contracts"
import { Context, Effect, Layer, PubSub, Ref, Stream, SubscriptionRef } from "effect"
import { PreferencesService } from "./PreferencesService.ts"

const NO_DESKTOP_REASON =
  "Updates are installed by the desktop app. Open Humanity from it to update."
const NO_DESKTOP: UpdateState = { _tag: "Unsupported", reason: NO_DESKTOP_REASON }
const IDLE: UpdateState = { _tag: "Idle" }

export class UpdateService extends Context.Service<
  UpdateService,
  {
    readonly watch: Stream.Stream<UpdateStatus>
    readonly setPreferences: (preferences: UpdatePreferences) => Effect.Effect<UpdatePreferences>
    readonly check: Effect.Effect<void, UpdatesUnavailable>
    readonly install: Effect.Effect<void, UpdatesUnavailable>
    readonly attachDesktop: (version: string) => Stream.Stream<DesktopUpdateCommand>
    readonly report: (state: UpdateState) => Effect.Effect<void>
  }
>()("humanity/UpdateService") {
  static readonly layer = Layer.effect(
    UpdateService,
    Effect.gen(function* () {
      const preferences = yield* PreferencesService
      const status = yield* SubscriptionRef.make<UpdateStatus>({
        currentVersion: null,
        preferences: yield* preferences.updates,
        state: NO_DESKTOP,
      })
      const commands = yield* PubSub.unbounded<DesktopUpdateCommand>()
      const attached = yield* Ref.make(0)

      const send = (command: DesktopUpdateCommand) =>
        Effect.gen(function* () {
          if ((yield* Ref.get(attached)) === 0) {
            return yield* new UpdatesUnavailable({ reason: NO_DESKTOP_REASON })
          }
          yield* PubSub.publish(commands, command)
        })

      const setPreferences = Effect.fn("UpdateService.setPreferences")(function* (
        next: UpdatePreferences,
      ) {
        const saved = yield* preferences.setUpdates(next)
        yield* SubscriptionRef.update(status, (current) => ({ ...current, preferences: saved }))
        yield* PubSub.publish(commands, { _tag: "Configure", preferences: saved })
        return saved
      })

      const attachDesktop = (version: string): Stream.Stream<DesktopUpdateCommand> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(commands)
            yield* Ref.update(attached, (count) => count + 1)
            yield* Effect.addFinalizer(() =>
              Ref.updateAndGet(attached, (count) => count - 1).pipe(
                Effect.flatMap((left) =>
                  left === 0
                    ? SubscriptionRef.update(status, (current) => ({
                        ...current,
                        currentVersion: null,
                        state: NO_DESKTOP,
                      }))
                    : Effect.void,
                ),
              ),
            )
            const current = yield* SubscriptionRef.updateAndGet(status, (previous) => ({
              ...previous,
              currentVersion: version,
              state: IDLE,
            }))
            return Stream.concat(
              Stream.succeed<DesktopUpdateCommand>({
                _tag: "Configure",
                preferences: current.preferences,
              }),
              Stream.fromSubscription(subscription),
            )
          }),
        )

      const report = (state: UpdateState) =>
        SubscriptionRef.update(status, (current) =>
          current.currentVersion === null ? current : { ...current, state },
        )

      return UpdateService.of({
        watch: SubscriptionRef.changes(status),
        setPreferences,
        check: send({ _tag: "Check" }),
        install: send({ _tag: "Install" }),
        attachDesktop,
        report,
      })
    }),
  )
}
