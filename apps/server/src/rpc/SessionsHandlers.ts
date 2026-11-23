import { SessionsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { PullRequestService } from "../services/PullRequestService.ts"
import { SessionService } from "../services/SessionService.ts"

export const SessionsHandlers = SessionsRpcs.toLayer(
  Effect.gen(function* () {
    const sessions = yield* SessionService
    const pullRequests = yield* PullRequestService
    return SessionsRpcs.of({
      "Sessions.list": ({ projectId }) => sessions.list(projectId),
      "Sessions.watchAll": () => sessions.watchAll,
      "Sessions.get": ({ sessionId }) => sessions.get(sessionId),
      "Sessions.create": (payload) => sessions.create(payload),
      "Sessions.setupWorktree": ({ sessionId }) => sessions.setupWorktree(sessionId),
      "Sessions.setAutonomy": ({ sessionId, autonomy }) =>
        sessions.setAutonomy(sessionId, autonomy),
      "Sessions.setModel": ({ sessionId, model }) => sessions.setModel(sessionId, model),
      "Sessions.switchProvider": ({ sessionId, provider, model, accountId }) =>
        sessions.switchProvider(sessionId, provider, model, accountId),
      "Sessions.setEffort": ({ sessionId, effort }) => sessions.setEffort(sessionId, effort),
      "Sessions.sendMessage": ({ sessionId, text, attachments, mentions }) =>
        sessions.sendMessage(sessionId, text, attachments ?? [], mentions ?? []),
      "Sessions.attachment": ({ sessionId, attachmentId }) =>
        sessions.attachment(sessionId, attachmentId),
      "Sessions.interrupt": ({ sessionId }) => sessions.interrupt(sessionId),
      "Sessions.refreshUsage": ({ sessionId }) => sessions.refreshUsage(sessionId),
      "Sessions.otherAccountsUsage": ({ sessionId, refresh }) =>
        sessions.otherAccountsUsage(sessionId, refresh),
      "Sessions.end": ({ sessionId, removeWorktree }) =>
        sessions.end(sessionId, { removeWorktree }),
      "Sessions.diff": ({ sessionId }) => sessions.diff(sessionId),
      "Sessions.searchFiles": ({ sessionId, query, recent }) =>
        sessions.searchFiles(sessionId, query, recent),
      "Sessions.commits": ({ sessionId }) => pullRequests.commits(sessionId),
      "Sessions.commit": ({ sessionId, message, paths }) =>
        sessions.commit(sessionId, message, paths),
      "Sessions.earlierMessages": ({ sessionId, before }) =>
        sessions.earlierMessages(sessionId, before),
      "Sessions.rewindPreview": ({ sessionId, messageId }) =>
        sessions.rewindPreview(sessionId, messageId),
      "Sessions.rewind": ({ sessionId, messageId, files, conversation }) =>
        sessions.rewind(sessionId, messageId, { files, conversation }),
      "Sessions.undoRewind": ({ sessionId, messageId }) =>
        sessions.undoRewind(sessionId, messageId),
      "Sessions.fork": ({ sessionId, messageId }) => sessions.fork(sessionId, messageId),
      "Sessions.search": (payload) => sessions.search(payload),
      "Sessions.handoffPreview": ({ sessionId }) => sessions.handoffPreview(sessionId),
      "Sessions.trimHandoff": ({ sessionId, excluded }) =>
        sessions.trimHandoff(sessionId, excluded),
      "Sessions.createGroup": (payload) => sessions.createGroup(payload),
      "Sessions.compareGroup": ({ groupId }) => sessions.compareGroup(groupId),
      "Sessions.usageReport": (payload) => sessions.usageReport(payload),
      "Sessions.subscribe": ({ sessionId }) => sessions.subscribe(sessionId),
    })
  }),
)
