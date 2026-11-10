import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { ProjectId } from "../domain/Project.ts"
import { Session, SessionId } from "../domain/Session.ts"
import { SessionEvent } from "../domain/SessionEvent.ts"
import {
  GitBranchExists,
  GitCommandFailed,
  GitInvalidBranchName,
  GitNotARepository,
  GitNotInstalled,
  GitRefNotFound,
  ProjectNotFound,
  SessionEnded,
  SessionNotFound,
} from "../Errors.ts"

export const SessionsRpcs = RpcGroup.make(
  Rpc.make("Sessions.list", {
    payload: { projectId: ProjectId },
    success: Schema.Array(Session),
    error: ProjectNotFound,
  }),
  Rpc.make("Sessions.get", {
    payload: { sessionId: SessionId },
    success: Session,
    error: SessionNotFound,
  }),
  /** Creates the session's branch and worktree, then sends `prompt` if one is given. */
  Rpc.make("Sessions.create", {
    payload: {
      projectId: ProjectId,
      title: Schema.optional(Schema.String),
      /** Branch to start from. Defaults to the project's default branch. */
      baseBranch: Schema.optional(Schema.String),
      prompt: Schema.optional(Schema.String),
    },
    success: Session,
    error: Schema.Union([
      ProjectNotFound,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
      GitBranchExists,
      GitInvalidBranchName,
      GitRefNotFound,
    ]),
  }),
  Rpc.make("Sessions.sendMessage", {
    payload: { sessionId: SessionId, text: Schema.NonEmptyString },
    error: Schema.Union([SessionNotFound, SessionEnded]),
  }),
  Rpc.make("Sessions.interrupt", {
    payload: { sessionId: SessionId },
    error: SessionNotFound,
  }),
  /** Stops the agent. `removeWorktree` deletes the worktree; the branch is always kept. */
  Rpc.make("Sessions.end", {
    payload: { sessionId: SessionId, removeWorktree: Schema.Boolean },
    success: Session,
    error: Schema.Union([SessionNotFound, GitNotInstalled, GitCommandFailed, GitNotARepository]),
  }),
  /** A snapshot of the session, then every event as it happens. */
  Rpc.make("Sessions.subscribe", {
    payload: { sessionId: SessionId },
    success: SessionEvent,
    error: SessionNotFound,
    stream: true,
  }),
)
