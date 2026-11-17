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
  type SessionUsage,
  type ToolCall,
  type TranscriptPage,
} from "@humanity/contracts"

export interface SkillLoad {
  readonly toolUseId: string
  readonly skill: string
  readonly at: string
}

export interface SessionView {
  readonly session: Session
  readonly messages: ReadonlyArray<ChatMessage>
  readonly hasEarlier: boolean
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly skills: ReadonlyArray<SkillLoad>
  readonly approvals: ReadonlyArray<Approval>
  readonly draft: string
  readonly error: string | null
  readonly usage: SessionUsage
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

export const reduceSessionEvent = (
  view: SessionView | undefined,
  event: SessionEvent,
): SessionView | undefined => {
  if (event._tag === "Snapshot") {
    return {
      session: event.session,
      messages: event.messages,
      hasEarlier: event.hasEarlier,
      toolCalls: byToolUseId(event.toolCalls),
      skills: skillsFrom(event.toolCalls),
      approvals: event.approvals,
      draft: "",
      error: null,
      usage: event.usage,
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
    case "UsageUpdated":
      return { ...view, usage: event.usage }
    case "AgentMessage": {
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

export const reduceSessionEvents = (
  view: SessionView | undefined,
  events: ReadonlyArray<SessionEvent>,
): SessionView | undefined => events.reduce(reduceSessionEvent, view)

export interface EarlierPages {
  readonly attachedTo: string
  readonly messages: ReadonlyArray<ChatMessage>
  readonly toolCalls: Readonly<Record<string, ToolCall>>
  readonly hasEarlier: boolean
}

export const addEarlierPage = (
  pages: EarlierPages | undefined,
  attachedTo: string,
  page: TranscriptPage,
): EarlierPages => {
  const kept = pages?.attachedTo === attachedTo ? pages : undefined
  return {
    attachedTo,
    messages: [...page.messages, ...(kept?.messages ?? [])],
    toolCalls: { ...byToolUseId(page.toolCalls), ...kept?.toolCalls },
    hasEarlier: page.hasEarlier,
  }
}

export const joinEarlier = (
  view: Pick<SessionView, "messages" | "toolCalls" | "hasEarlier">,
  pages: EarlierPages | undefined,
): Pick<SessionView, "messages" | "toolCalls" | "hasEarlier"> => {
  if (pages === undefined || pages.attachedTo !== view.messages[0]?.id) return view
  return {
    messages: [...pages.messages, ...view.messages],
    toolCalls: { ...pages.toolCalls, ...view.toolCalls },
    hasEarlier: pages.hasEarlier,
  }
}

export const isBusy = (status: SessionStatus): boolean =>
  status === "running" || status === "waiting_for_human"

export const pendingChanges = (approvals: ReadonlyArray<Approval>): Array<ProposedChange> =>
  approvals.flatMap((approval) =>
    approval._tag === "change" && isPendingApproval(approval) ? [approval.change] : [],
  )

export const pendingConfirmations = (
  approvals: ReadonlyArray<Approval>,
): Array<PendingConfirmation> =>
  approvals.flatMap((approval) =>
    approval._tag === "confirmation" && isPendingApproval(approval) ? [approval.confirmation] : [],
  )

export const approvalsByToolUse = (
  approvals: ReadonlyArray<Approval>,
): ReadonlyMap<string, Approval> =>
  new Map(
    approvals.map((approval) => [
      approval._tag === "change" ? approval.change.toolUseId : approval.confirmation.toolUseId,
      approval,
    ]),
  )
