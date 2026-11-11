import { SessionsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { SessionService } from "../services/SessionService.ts"

export const SessionsHandlers = SessionsRpcs.toLayer(
  Effect.gen(function* () {
    const sessions = yield* SessionService
    return SessionsRpcs.of({
      "Sessions.list": ({ projectId }) => sessions.list(projectId),
      "Sessions.watchAll": () => sessions.watchAll,
      "Sessions.get": ({ sessionId }) => sessions.get(sessionId),
      "Sessions.create": (payload) => sessions.create(payload),
      "Sessions.setupWorktree": ({ sessionId }) => sessions.setupWorktree(sessionId),
      "Sessions.setAutonomy": ({ sessionId, autonomy }) =>
        sessions.setAutonomy(sessionId, autonomy),
      "Sessions.setModel": ({ sessionId, model }) => sessions.setModel(sessionId, model),
      "Sessions.setEffort": ({ sessionId, effort }) => sessions.setEffort(sessionId, effort),
      "Sessions.sendMessage": ({ sessionId, text, attachments }) =>
        sessions.sendMessage(sessionId, text, attachments ?? []),
      "Sessions.attachment": ({ sessionId, attachmentId }) =>
        sessions.attachment(sessionId, attachmentId),
      "Sessions.interrupt": ({ sessionId }) => sessions.interrupt(sessionId),
      "Sessions.end": ({ sessionId, removeWorktree }) =>
        sessions.end(sessionId, { removeWorktree }),
      "Sessions.diff": ({ sessionId }) => sessions.diff(sessionId),
      "Sessions.commit": ({ sessionId, message }) => sessions.commit(sessionId, message),
      "Sessions.subscribe": ({ sessionId }) => sessions.subscribe(sessionId),
    })
  }),
)
