import { Effect, Schedule, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient } from "@/lib/rpc"

export const updateStatusAtom = HumanityClient.runtime
  .atom(() =>
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Updates.watch", undefined))),
    ).pipe(Stream.retry(Schedule.spaced("1 second"))),
  )
  .pipe(Atom.keepAlive)

export const setUpdatePreferencesAtom = HumanityClient.mutation("Updates.setPreferences")
export const checkForUpdateAtom = HumanityClient.mutation("Updates.check")
export const installUpdateAtom = HumanityClient.mutation("Updates.install")
