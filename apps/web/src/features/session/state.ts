import {
  type Approval,
  approvalKey,
  type ChatMessage,
  isPendingApproval,
  type PendingConfirmation,
  type ProposedChange,
  type Session,
  type SessionEvent,
  type SessionStatus,
  type ToolCall,
} from "@humanity/contracts"

export interface SkillLoad {
  readonly toolUseId: string
  readonly skill: string
  readonly at: string
}

/** Everything the workspace shows about one session, rebuilt from its event stream. */
export interface SessionView {
  readonly session: Session
  readonly messages: ReadonlyArray<ChatMessage>
  /** Tool calls by `toolUseId`, so tool_use blocks can find their status and output. */
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly skills: ReadonlyArray<SkillLoad>
  /** Every approval of the session in request order, pending and decided. */
  readonly approvals: ReadonlyArray<Approval>
  /** Assistant text streamed so far for the message being written. */
  readonly draft: string
  /** Why the session last stopped with an error, if it did. */
  readonly error: string | null
}

const byToolUseId = (toolCalls: ReadonlyArray<ToolCall>) =>
  Object.fromEntries(toolCalls.map((call) => [call.toolUseId, call]))

const skillsFrom = (toolCalls: ReadonlyArray<ToolCall>): Array<SkillLoad> =>
  toolCalls
    .filter((call) => call.toolName === "Skill")
    .map((call) => {
      const skill = (call.input as { readonly skill?: unknown } | null)?.skill
      return {
        toolUseId: call.toolUseId,
        skill: typeof skill === "string" ? skill : "unknown",
        at: call.startedAt,
      }
    })

const withStatus = (view: SessionView, status: SessionStatus): SessionView => ({
  ...view,
  session: { ...view.session, status },
})

/**
 * Folds one event into the view. `undefined` means nothing has arrived yet;
 * every event before the first snapshot is ignored, and a snapshot (sent again
 * after a reconnect) replaces whatever was there.
 */
export const reduceSessionEvent = (
  view: SessionView | undefined,
  event: SessionEvent,
): SessionView | undefined => {
  if (event._tag === "Snapshot") {
    return {
      session: event.session,
      messages: event.messages,
      toolCalls: byToolUseId(event.toolCalls),
      skills: skillsFrom(event.toolCalls),
      approvals: event.approvals,
      draft: "",
      error: null,
    }
  }
  if (view === undefined) return undefined

  switch (event._tag) {
    case "SessionStatusChanged": {
      const next = withStatus(view, event.status)
      const settled = event.status !== "running" && event.status !== "waiting_for_human"
      return {
        ...next,
        error: event.status === "error" ? event.error : null,
        draft: settled ? "" : next.draft,
      }
    }
    case "SessionUpdated":
      return { ...view, session: event.session }
    case "AgentMessage": {
      // A message can arrive both in the snapshot and live; keep one copy.
      if (view.messages.some((message) => message.id === event.message.id)) return view
      const content = event.message.content
      const endsDraft =
        content._tag === "result" ||
        (content._tag === "assistant" &&
          content.parentToolUseId === null &&
          content.blocks.some((block) => block._tag === "text"))
      return {
        ...view,
        messages: [...view.messages, event.message],
        draft: endsDraft ? "" : view.draft,
      }
    }
    case "TextDelta":
      return { ...view, draft: view.draft + event.text }
    case "ToolCallStarted":
    case "ToolCallFinished":
      return {
        ...view,
        toolCalls: { ...view.toolCalls, [event.toolCall.toolUseId]: event.toolCall },
      }
    case "ApprovalRequested":
    case "ApprovalResolved": {
      const key = approvalKey(event.approval)
      const exists = view.approvals.some((approval) => approvalKey(approval) === key)
      return {
        ...view,
        approvals: exists
          ? view.approvals.map((approval) =>
              approvalKey(approval) === key ? event.approval : approval,
            )
          : [...view.approvals, event.approval],
      }
    }
    case "SkillLoaded":
      return view.skills.some((skill) => skill.toolUseId === event.toolUseId)
        ? view
        : {
            ...view,
            skills: [
              ...view.skills,
              { toolUseId: event.toolUseId, skill: event.skill, at: event.at },
            ],
          }
  }
}

/** Statuses in which the agent is doing something and can be interrupted. */
export const isBusy = (status: SessionStatus): boolean =>
  status === "running" || status === "waiting_for_human"

/** File changes still waiting for the human, oldest first. */
export const pendingChanges = (view: SessionView): Array<ProposedChange> =>
  view.approvals.flatMap((approval) =>
    approval._tag === "change" && isPendingApproval(approval) ? [approval.change] : [],
  )

/** Tool calls still waiting for an allow or deny, oldest first. */
export const pendingConfirmations = (view: SessionView): Array<PendingConfirmation> =>
  view.approvals.flatMap((approval) =>
    approval._tag === "confirmation" && isPendingApproval(approval) ? [approval.confirmation] : [],
  )

/** The approval attached to a tool call, if the call needed one. */
export const approvalForToolUse = (view: SessionView, toolUseId: string): Approval | undefined =>
  view.approvals.findLast((approval) =>
    approval._tag === "change"
      ? approval.change.toolUseId === toolUseId
      : approval.confirmation.toolUseId === toolUseId,
  )
