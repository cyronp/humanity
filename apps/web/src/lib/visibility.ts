import { Stream } from "effect"

/** Whether this page is on screen, now and whenever that changes. */
export const pageVisible: Stream.Stream<boolean> = Stream.suspend(() =>
  Stream.concat(
    Stream.sync(() => document.visibilityState === "visible"),
    Stream.fromEventListener(document, "visibilitychange").pipe(
      Stream.map(() => document.visibilityState === "visible"),
    ),
  ),
).pipe(Stream.changes)

/**
 * Runs `watch` only while `visible` says so: hiding the page ends the
 * subscription, showing it again starts a new one. Nothing is emitted while
 * hidden, so whoever reads the stream keeps the last value it saw.
 */
export const whileVisible = <A, E, R>(
  visible: Stream.Stream<boolean>,
  watch: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> =>
  visible.pipe(Stream.switchMap((shown) => (shown ? watch : Stream.never)))
