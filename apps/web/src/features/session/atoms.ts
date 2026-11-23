import { type ProjectId, SessionId } from "@humanity/contracts"
import { Effect, Schedule, Stream } from "effect"
import { Atom } from "effect/reactivity"
import { HumanityClient, keys } from "@/lib/rpc"
import { pageVisible, whileVisible } from "@/lib/visibility"
import { reduceSessionEvents, type SessionView } from "./state.ts"

export const sessionsAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query(
    "Sessions.list",
    { projectId },
    { reactivityKeys: [keys.sessions(projectId)] },
  ),
)

export const allSessionsAtom = HumanityClient.runtime
  .atom(() =>
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Sessions.watchAll", undefined))),
    ).pipe(Stream.retry(Schedule.spaced("1 second"))),
  )
  .pipe(Atom.keepAlive)

const BATCH_WINDOW = "50 millis"
const BATCH_SIZE = 512

export const sessionViewAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.runtime.atom(
    Stream.unwrap(
      HumanityClient.use((client) => Effect.succeed(client("Sessions.subscribe", { sessionId }))),
    ).pipe(
      Stream.retry(Schedule.spaced("1 second")),
      Stream.groupedWithin(BATCH_SIZE, BATCH_WINDOW),
      Stream.scan((): SessionView | undefined => undefined, reduceSessionEvents),
    ),
  ),
)

export const earlierMessagesAtom = HumanityClient.mutation("Sessions.earlierMessages")

export const createSessionAtom = HumanityClient.mutation("Sessions.create")
export const sendMessageAtom = HumanityClient.mutation("Sessions.sendMessage")
export const setupWorktreeAtom = HumanityClient.mutation("Sessions.setupWorktree")
export const setAutonomyAtom = HumanityClient.mutation("Sessions.setAutonomy")
export const setModelAtom = HumanityClient.mutation("Sessions.setModel")
export const switchProviderAtom = HumanityClient.mutation("Sessions.switchProvider")
export const setEffortAtom = HumanityClient.mutation("Sessions.setEffort")

export const attachmentAtom = Atom.family((key: string) => {
  const [sessionId = "", attachmentId = ""] = key.split("/")
  return HumanityClient.query("Sessions.attachment", {
    sessionId: SessionId.make(sessionId),
    attachmentId,
  })
})
export const fetchAttachmentAtom = HumanityClient.mutation("Sessions.attachment")
export const interruptAtom = HumanityClient.mutation("Sessions.interrupt")
export const rewindPreviewAtom = HumanityClient.mutation("Sessions.rewindPreview")
export const rewindAtom = HumanityClient.mutation("Sessions.rewind")
export const undoRewindAtom = HumanityClient.mutation("Sessions.undoRewind")
export const forkAtom = HumanityClient.mutation("Sessions.fork")
export const searchMessagesAtom = HumanityClient.mutation("Sessions.search")
export const handoffPreviewAtom = HumanityClient.mutation("Sessions.handoffPreview")
export const trimHandoffAtom = HumanityClient.mutation("Sessions.trimHandoff")
export const usageReportAtom = HumanityClient.mutation("Sessions.usageReport")
export const createGroupAtom = HumanityClient.mutation("Sessions.createGroup")
export const compareGroupAtom = HumanityClient.mutation("Sessions.compareGroup")
export const refreshUsageAtom = HumanityClient.mutation("Sessions.refreshUsage")
export const otherAccountsUsageAtom = HumanityClient.mutation("Sessions.otherAccountsUsage")
export const endSessionAtom = HumanityClient.mutation("Sessions.end")

export const decideChangeAtom = HumanityClient.mutation("Approvals.decideChange")
export const decideConfirmationAtom = HumanityClient.mutation("Approvals.decideConfirmation")

export const searchSessionFilesAtom = HumanityClient.mutation("Sessions.searchFiles")

export const sessionDiffAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.query(
    "Sessions.diff",
    { sessionId },
    { reactivityKeys: [keys.sessionDiff(sessionId)] },
  ),
)

export const sessionCommitsAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.query(
    "Sessions.commits",
    { sessionId },
    { reactivityKeys: [keys.sessionCommits(sessionId)] },
  ),
)

export const comparisonKey = (sessionId: SessionId, base: string): string => `${sessionId}\n${base}`

export const comparisonAtom = Atom.family((key: string) => {
  const [id = "", base = ""] = key.split("\n")
  const sessionId = SessionId.make(id)
  return HumanityClient.query(
    "PullRequests.compare",
    { sessionId, base },
    { reactivityKeys: [keys.sessionCommits(sessionId), keys.publication(sessionId)] },
  )
})

export const commitAtom = HumanityClient.mutation("Sessions.commit")

export const publicationAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.query(
    "PullRequests.publication",
    { sessionId },
    { reactivityKeys: [keys.publication(sessionId)] },
  ),
)

export const feedKey = (sessionId: SessionId, branch: string | null): string =>
  `${sessionId}\n${branch ?? ""}`

export const pullRequestFeedAtom = Atom.family((key: string) => {
  const sessionId = SessionId.make(key.split("\n")[0] ?? "")
  return HumanityClient.runtime.atom(
    whileVisible(
      pageVisible,
      Stream.unwrap(
        HumanityClient.use((client) => Effect.succeed(client("PullRequests.watch", { sessionId }))),
      ).pipe(Stream.retry(Schedule.spaced("5 seconds"))),
    ),
  )
})

export const refreshPullRequestAtom = HumanityClient.mutation("PullRequests.refresh")

export const syncStatusAtom = Atom.family((sessionId: SessionId) =>
  HumanityClient.query(
    "PullRequests.syncStatus",
    { sessionId, fetch: false },
    { reactivityKeys: [keys.sync(sessionId), keys.publication(sessionId)] },
  ),
)

export const fetchOriginAtom = HumanityClient.mutation("PullRequests.syncStatus")

export const syncAtom = HumanityClient.mutation("PullRequests.sync")

export const pushAtom = HumanityClient.mutation("PullRequests.push")
export const createPullRequestAtom = HumanityClient.mutation("PullRequests.create")
export const mergePullRequestAtom = HumanityClient.mutation("PullRequests.merge")
export const setPullRequestOpenAtom = HumanityClient.mutation("PullRequests.setOpen")
export const setPullRequestDraftAtom = HumanityClient.mutation("PullRequests.setDraft")

export const historyAtom = Atom.family((projectId: ProjectId) =>
  HumanityClient.query(
    "Approvals.history",
    { projectId },
    { reactivityKeys: [keys.history(projectId)] },
  ),
)
