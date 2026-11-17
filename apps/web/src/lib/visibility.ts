import { Stream } from "effect"

export const pageVisible: Stream.Stream<boolean> = Stream.suspend(() =>
  Stream.concat(
    Stream.sync(() => document.visibilityState === "visible"),
    Stream.fromEventListener(document, "visibilitychange").pipe(
      Stream.map(() => document.visibilityState === "visible"),
    ),
  ),
).pipe(Stream.changes)

export const whileVisible = <A, E, R>(
  visible: Stream.Stream<boolean>,
  watch: Stream.Stream<A, E, R>,
): Stream.Stream<A, E, R> =>
  visible.pipe(Stream.switchMap((shown) => (shown ? watch : Stream.never)))
