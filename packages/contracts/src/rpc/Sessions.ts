import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AttachmentContent, AttachmentUpload } from "../domain/Attachment.ts"
import { Autonomy } from "../domain/Policy.ts"
import { ProjectId } from "../domain/Project.ts"
import { ReasoningEffort, Session, SessionId } from "../domain/Session.ts"
import { WorkingTreeDiff } from "../domain/Git.ts"
import { SessionEvent } from "../domain/SessionEvent.ts"
import {
  AttachmentNotFound,
  AttachmentRejected,
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
  /**
   * Starts a session in the project's checkout, then sends `prompt` if one is
   * given. No worktree is made until `Sessions.setupWorktree`.
   */
  Rpc.make("Sessions.create", {
    payload: {
      projectId: ProjectId,
      title: Schema.optional(Schema.String),
      /**
       * Branch the checkout switches to first (a remote one such as
       * `origin/x` switches to the local `x`). Stays on its branch when absent.
       */
      baseBranch: Schema.optional(Schema.String),
      prompt: Schema.optional(Schema.String),
      /** Files sent with `prompt`. */
      attachments: Schema.optional(Schema.Array(AttachmentUpload)),
      /** A model value from `Claude.status`. Claude Code's default when absent. */
      model: Schema.optional(Schema.String),
      /** The model's own default effort when absent. */
      effort: Schema.optional(ReasoningEffort),
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
      AttachmentRejected,
    ]),
  }),
  /**
   * Moves a session out of the project's checkout into its own branch
   * `humanity/<short-id>-<slug>` and worktree, starting from the checkout's
   * HEAD. Uncommitted changes stay in the checkout. Only between turns; the
   * conversation resumes in the worktree. Returns the session as is when it
   * already has one.
   */
  Rpc.make("Sessions.setupWorktree", {
    payload: { sessionId: SessionId },
    success: Session,
    error: Schema.Union([
      SessionNotFound,
      SessionEnded,
      SessionBusy,
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
  /**
   * Changes how hard the model reasons; `null` is the model's own default. A
   * running agent switches right away; otherwise the next run starts on it.
   */
  Rpc.make("Sessions.setEffort", {
    payload: { sessionId: SessionId, effort: Schema.NullOr(ReasoningEffort) },
    success: Session,
    error: Schema.Union([SessionNotFound, SessionEnded]),
  }),
  Rpc.make("Sessions.sendMessage", {
    payload: {
      sessionId: SessionId,
      text: Schema.NonEmptyString,
      attachments: Schema.optional(Schema.Array(AttachmentUpload)),
    },
    error: Schema.Union([SessionNotFound, SessionEnded, AttachmentRejected]),
  }),
  /** The bytes of a file attached to one of the session's messages. */
  Rpc.make("Sessions.attachment", {
    payload: { sessionId: SessionId, attachmentId: Schema.String },
    success: AttachmentContent,
    error: Schema.Union([SessionNotFound, AttachmentNotFound]),
  }),
  Rpc.make("Sessions.interrupt", {
    payload: { sessionId: SessionId },
    error: SessionNotFound,
  }),
  /**
   * Stops the agent. `removeWorktree` deletes the session's worktree, if it has
   * one; the branch is always kept. The project's checkout is never removed.
   */
  Rpc.make("Sessions.end", {
    payload: { sessionId: SessionId, removeWorktree: Schema.Boolean },
    success: Session,
    error: Schema.Union([SessionNotFound, GitNotInstalled, GitCommandFailed, GitNotARepository]),
  }),
  /** Uncommitted changes where the session works (worktree or checkout): what a commit would contain. */
  Rpc.make("Sessions.diff", {
    payload: { sessionId: SessionId },
    success: WorkingTreeDiff,
    error: Schema.Union([SessionNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed]),
  }),
  /** Commits everything where the session works to the branch checked out there. Returns the short hash. */
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
