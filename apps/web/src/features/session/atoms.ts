import type { ProjectId, SessionId } from "@humanity/contracts"
import { Effect, Schedule, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"
import { reduceSessionEvent, type SessionView } from "./state.ts"

export const sessionsAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query(
    "Sessions.list",
    { projectId },
    { reactivityKeys: [keys.sessions(projectId)] },
  ),
)

/**
 * Every session of every project, most recently active first, kept live by
 * `Sessions.watchAll`. Feeds the sidebar and the home page's project choice.
 */
export const allSessionsAtom = HumanityClient.runtime
  .atom(() =>
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Sessions.watchAll", undefined))),
    ).pipe(Stream.retry(Schedule.spaced("1 second"))),
  )
  .pipe(Atom.keepAlive)

/**
 * The live view of one session: the subscription's snapshot plus every event
 * since, folded by `reduceSessionEvent`. A dropped connection resubscribes and
 * the fresh snapshot replaces the old state.
 */
export const sessionViewAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.runtime.atom(
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Sessions.subscribe", { sessionId }))),
    ).pipe(
      Stream.retry(Schedule.spaced("1 second")),
      Stream.scan((): SessionView | undefined => undefined, reduceSessionEvent),
    ),
  ),
)

export const createSessionAtom = HumanityClient.mutation("Sessions.create")
export const sendMessageAtom = HumanityClient.mutation("Sessions.sendMessage")
export const interruptAtom = HumanityClient.mutation("Sessions.interrupt")
export const endSessionAtom = HumanityClient.mutation("Sessions.end")

export const decideChangeAtom = HumanityClient.mutation("Approvals.decideChange")
export const decideConfirmationAtom = HumanityClient.mutation("Approvals.decideConfirmation")

export const sessionDiffAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.query(
    "Sessions.diff",
    { sessionId },
    { reactivityKeys: [keys.sessionDiff(sessionId)] },
  ),
)

export const commitAtom = HumanityClient.mutation("Sessions.commit")

export const historyAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query(
    "Approvals.history",
    { projectId },
    { reactivityKeys: [keys.history(projectId)] },
  ),
)
