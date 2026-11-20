import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { AttachmentContent, AttachmentUpload } from "../domain/Attachment.ts"
import { Autonomy } from "../domain/Policy.ts"
import { ProjectId } from "../domain/Project.ts"
import { AgentProvider } from "../domain/Provider.ts"
import {
  AccountUsage,
  ReasoningEffort,
  Session,
  SessionId,
  SessionUsage,
} from "../domain/Session.ts"
import { BranchCommits, FileEntry, WorkingTreeDiff } from "../domain/Git.ts"
import { FileMentions } from "../domain/Mention.ts"
import { SessionEvent, TranscriptPage } from "../domain/SessionEvent.ts"
import {
  AttachmentNotFound,
  AttachmentRejected,
  BranchNotCheckedOut,
  GitBranchExists,
  GitCommandFailed,
  GitInvalidBranchName,
  GitNotARepository,
  GitNotInstalled,
  GitRefNotFound,
  NothingToCommit,
  PlanUsageUnavailable,
  ProjectNotFound,
  ProviderSwitchUnavailable,
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
  Rpc.make("Sessions.watchAll", {
    success: Schema.Array(Session),
    stream: true,
  }),
  Rpc.make("Sessions.get", {
    payload: { sessionId: SessionId },
    success: Session,
    error: SessionNotFound,
  }),
  Rpc.make("Sessions.create", {
    payload: {
      projectId: ProjectId,
      title: Schema.optional(Schema.String),
      baseBranch: Schema.optional(Schema.String),
      prompt: Schema.optional(Schema.String),
      attachments: Schema.optional(Schema.Array(AttachmentUpload)),
      mentions: Schema.optional(FileMentions),
      provider: Schema.optional(AgentProvider),
      model: Schema.optional(Schema.String),
      effort: Schema.optional(ReasoningEffort),
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
  Rpc.make("Sessions.setAutonomy", {
    payload: { sessionId: SessionId, autonomy: Autonomy },
    success: Session,
    error: Schema.Union([SessionNotFound, SessionEnded]),
  }),
  Rpc.make("Sessions.setModel", {
    payload: { sessionId: SessionId, model: Schema.NullOr(Schema.String) },
    success: Session,
    error: Schema.Union([SessionNotFound, SessionEnded]),
  }),
  Rpc.make("Sessions.switchProvider", {
    payload: {
      sessionId: SessionId,
      provider: AgentProvider,
      model: Schema.NullOr(Schema.String),
      /** The account to run as; the provider's active account when left out. */
      accountId: Schema.optional(Schema.String),
    },
    success: Session,
    error: Schema.Union([SessionNotFound, SessionEnded, ProviderSwitchUnavailable]),
  }),
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
      mentions: Schema.optional(FileMentions),
    },
    error: Schema.Union([SessionNotFound, SessionEnded, AttachmentRejected]),
  }),
  Rpc.make("Sessions.attachment", {
    payload: { sessionId: SessionId, attachmentId: Schema.String },
    success: AttachmentContent,
    error: Schema.Union([SessionNotFound, AttachmentNotFound]),
  }),
  Rpc.make("Sessions.interrupt", {
    payload: { sessionId: SessionId },
    error: SessionNotFound,
  }),
  Rpc.make("Sessions.end", {
    payload: { sessionId: SessionId, removeWorktree: Schema.Boolean },
    success: Session,
    error: Schema.Union([SessionNotFound, GitNotInstalled, GitCommandFailed, GitNotARepository]),
  }),
  Rpc.make("Sessions.diff", {
    payload: { sessionId: SessionId },
    success: WorkingTreeDiff,
    error: Schema.Union([SessionNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed]),
  }),
  Rpc.make("Sessions.searchFiles", {
    payload: {
      sessionId: SessionId,
      query: Schema.String,
      recent: Schema.optional(Schema.Array(Schema.String)),
    },
    success: Schema.Array(FileEntry),
    error: Schema.Union([SessionNotFound, GitNotARepository, GitNotInstalled, GitCommandFailed]),
  }),
  Rpc.make("Sessions.commits", {
    payload: { sessionId: SessionId },
    success: BranchCommits,
    error: Schema.Union([
      SessionNotFound,
      ProjectNotFound,
      GitRefNotFound,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
    ]),
  }),
  Rpc.make("Sessions.commit", {
    payload: {
      sessionId: SessionId,
      message: Schema.NonEmptyString,
      paths: Schema.optional(Schema.Array(Schema.NonEmptyString)),
    },
    success: Schema.String,
    error: Schema.Union([
      SessionNotFound,
      SessionBusy,
      NothingToCommit,
      BranchNotCheckedOut,
      GitNotARepository,
      GitNotInstalled,
      GitCommandFailed,
    ]),
  }),
  Rpc.make("Sessions.refreshUsage", {
    payload: { sessionId: SessionId },
    success: SessionUsage,
    error: Schema.Union([SessionNotFound, PlanUsageUnavailable]),
  }),
  Rpc.make("Sessions.otherAccountsUsage", {
    payload: { sessionId: SessionId, refresh: Schema.Boolean },
    success: Schema.Array(AccountUsage),
    error: SessionNotFound,
  }),
  Rpc.make("Sessions.earlierMessages", {
    payload: { sessionId: SessionId, before: Schema.String },
    success: TranscriptPage,
    error: SessionNotFound,
  }),
  Rpc.make("Sessions.subscribe", {
    payload: { sessionId: SessionId },
    success: SessionEvent,
    error: SessionNotFound,
    stream: true,
  }),
)
