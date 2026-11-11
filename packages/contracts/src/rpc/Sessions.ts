import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Autonomy } from "../domain/Policy.ts"
import { ProjectId } from "../domain/Project.ts"
import { Session, SessionId } from "../domain/Session.ts"
import { WorkingTreeDiff } from "../domain/Git.ts"
import { SessionEvent } from "../domain/SessionEvent.ts"
import {
  GitBranchExists,
  GitCommandFailed,
  GitInvalidBranchName,
  GitNotARepository,
  GitNotInstalled,
  GitRefNotFound,
  NothingToCommit,
  ProjectNotFound,
  SessionBusy,
  SessionEnded,
  SessionNotFound,
} from "../Errors.ts"

export const SessionsRpcs = RpcGroup.make(
  Rpc.make("Sessions.list", {
    payload: { projectId: ProjectId },
    success: Schema.Array(Session),
    error: ProjectNotFound,
  }),
  /**
   * Every session of every project, most recently active first: once on
   * subscribe, then again whenever a session is created, changes status or is
   * removed with its project.
   */
  Rpc.make("Sessions.watchAll", {
    success: Schema.Array(Session),
    stream: true,
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
      /** A model value from `Claude.status`. Claude Code's default when absent. */
      model: Schema.optional(Schema.String),
      /** `ask` (the project's policy as it is) when absent. */
      autonomy: Schema.optional(Autonomy),
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
  /** Changes how much the agent may do without asking. Applies from the next tool call. */
  Rpc.make("Sessions.setAutonomy", {
    payload: { sessionId: SessionId, autonomy: Autonomy },
    success: Session,
    error: Schema.Union([SessionNotFound, SessionEnded]),
  }),
  /**
   * Changes the model the agent runs on: a value from `Claude.status`, or
   * `null` for Claude Code's default. A running agent switches right away;
   * otherwise the next run starts on it.
   */
  Rpc.make("Sessions.setModel", {
    payload: { sessionId: SessionId, model: Schema.NullOr(Schema.String) },
    success: Session,
    error: Schema.Union([SessionNotFound, SessionEnded]),
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
  /** Uncommitted changes in the session's worktree: what a commit would contain. */
  Rpc.make("Sessions.diff", {
    payload: { sessionId: SessionId },
    success: WorkingTreeDiff,
    error: Schema.Union([SessionNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed]),
  }),
  /** Commits everything in the session's worktree to the session's branch. Returns the short hash. */
  Rpc.make("Sessions.commit", {
    payload: { sessionId: SessionId, message: Schema.NonEmptyString },
    success: Schema.String,
    error: Schema.Union([
      SessionNotFound,
      SessionBusy,
      NothingToCommit,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
    ]),
  }),
  /** A snapshot of the session, then every event as it happens. */
  Rpc.make("Sessions.subscribe", {
    payload: { sessionId: SessionId },
    success: SessionEvent,
    error: SessionNotFound,
    stream: true,
  }),
)
