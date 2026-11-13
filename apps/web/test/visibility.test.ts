import { Effect, PubSub, Stream } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { whileVisible } from "@/lib/visibility"

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

/** A page whose visibility the test flips, and a feed that counts who is watching it. */
const stage = () => {
  const visibility = Effect.runSync(PubSub.unbounded<boolean>())
  const feed = Effect.runSync(PubSub.unbounded<string>())
  const watchers = { now: 0, ever: 0 }
  const watch = Stream.unwrap(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          watchers.now += 1
          watchers.ever += 1
        }),
        () => Effect.sync(() => void (watchers.now -= 1)),
      )
      return Stream.fromPubSub(feed)
    }),
  )
  const atom = Atom.make(
    whileVisible(Stream.concat(Stream.make(true), Stream.fromPubSub(visibility)), watch),
  )
  const show = (visible: boolean) => Effect.runSync(PubSub.publish(visibility, visible))
  const say = (value: string) => Effect.runSync(PubSub.publish(feed, value))
  return { atom, watchers, show, say }
}

describe("whileVisible", () => {
  it("watches only while the page is shown and keeps the last value while hidden", async () => {
    const { atom, watchers, show, say } = stage()
    const registry = AtomRegistry.make()
    const unmount = registry.mount(atom)
    const value = () => {
      const result = registry.get(atom)
      return AsyncResult.isSuccess(result) ? result.value : undefined
    }

    await tick()
    expect(watchers).toEqual({ now: 1, ever: 1 })
    say("first")
    await tick()
    expect(value()).toBe("first")

    // Hidden: the subscription ends, so the daemon stops asking the forge for this page.
    show(false)
    await tick()
    expect(watchers).toEqual({ now: 0, ever: 1 })
    say("missed")
    await tick()
    expect(value()).toBe("first")

    // Shown again: a new subscription, which the daemon answers with what it knows.
    show(true)
    await tick()
    expect(watchers).toEqual({ now: 1, ever: 2 })
    say("second")
    await tick()
    expect(value()).toBe("second")

    // The panel closes: nobody watches.
    unmount()
    await tick()
    expect(watchers.now).toBe(0)
  })
})
