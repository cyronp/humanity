import { Effect, Schedule, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"

export const localServersAtom = Atom.family((fast: boolean) =>
  HumanityClient.runtime.atom(
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Preview.servers", { fast }))),
    ).pipe(Stream.retry(Schedule.spaced("2 seconds"))),
  ),
)

export const stopServerAtom = HumanityClient.mutation("Preview.stopServer")
export const probeAtom = HumanityClient.mutation("Preview.probe")
export const fileUrlAtom = HumanityClient.mutation("Preview.fileUrl")

export const browserPreferencesAtom = HumanityClient.query("Preferences.getBrowser", undefined, {
  reactivityKeys: [keys.preferences],
})
export const setBrowserPreferencesAtom = HumanityClient.mutation("Preferences.setBrowser")
