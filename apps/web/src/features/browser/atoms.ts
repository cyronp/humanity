import { Effect, Schedule, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient } from "@/lib/rpc"

/** The local servers on this machine, scanned every 2 s while `fast`, else every 10 s. */
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
