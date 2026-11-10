import { SessionsRpcs } from "@humanity/contracts"
import { Effect } from "effect"
import { SessionService } from "../services/SessionService.ts"

export const SessionsHandlers = SessionsRpcs.toLayer(
  Effect.gen(function* () {
    const sessions = yield* SessionService
    return SessionsRpcs.of({
      "Sessions.list": ({ projectId }) => sessions.list(projectId),
      "Sessions.get": ({ sessionId }) => sessions.get(sessionId),
      "Sessions.create": (payload) => sessions.create(payload),
      "Sessions.sendMessage": ({ sessionId, text }) => sessions.sendMessage(sessionId, text),
      "Sessions.interrupt": ({ sessionId }) => sessions.interrupt(sessionId),
      "Sessions.end": ({ sessionId, removeWorktree }) =>
        sessions.end(sessionId, { removeWorktree }),
      "Sessions.subscribe": ({ sessionId }) => sessions.subscribe(sessionId),
    })
  }),
)
