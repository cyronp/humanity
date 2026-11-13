import { Schema } from "effect"
import { ProjectId } from "./Project.ts"
import { ReasoningEffort, SessionId } from "./Session.ts"

/** The thread an `open_thread` call opened. */
export const OpenedThread = Schema.Struct({
  sessionId: SessionId,
  projectId: ProjectId,
  title: Schema.String,
  /** The model the thread runs on, or `null` for Claude Code's default. */
  model: Schema.NullOr(Schema.String),
  /** How hard the model reasons, or `null` for the model's default. */
  effort: Schema.NullOr(ReasoningEffort),
})
export type OpenedThread = typeof OpenedThread.Type

/** Where a thread lives in the app: the path of its page. */
export const threadHref = (projectId: string, sessionId: string): string =>
  `/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`

const THREAD_HREF = /^(?:https?:\/\/[^/]+)?\/projects\/([^/?#]+)\/sessions\/([^/?#]+)\/?$/

const decodeSegment = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

/** The thread a link points to, or `undefined` when the link goes anywhere else. */
export const parseThreadHref = (
  href: string,
): { readonly projectId: ProjectId; readonly sessionId: SessionId } | undefined => {
  const match = THREAD_HREF.exec(href)
  const projectId = decodeSegment(match?.[1] ?? "")
  const sessionId = decodeSegment(match?.[2] ?? "")
  if (!projectId || !sessionId) return undefined
  return { projectId: ProjectId.make(projectId), sessionId: SessionId.make(sessionId) }
}

/** A markdown link to a thread. The chat shows it as the project's icon and the thread's title. */
export const threadMarkdownLink = (
  thread: Pick<OpenedThread, "projectId" | "sessionId" | "title">,
): string =>
  `[${thread.title.replace(/[\\[\]]/g, "\\$&")}](${threadHref(thread.projectId, thread.sessionId)})`

/**
 * The result of `open_thread` for a thread it opened, as the agent reads it:
 * what runs, and the link to put in its reply.
 */
export const formatOpenedThread = (thread: OpenedThread): string => {
  const runsOn = [
    thread.model ?? "the default model",
    ...(thread.effort === null ? [] : [`${thread.effort} effort`]),
  ].join(", ")
  return [
    `Opened the thread "${thread.title}" on ${runsOn}. It is working now.`,
    `When you tell the human about it, link to it inline in your sentence, with exactly this markdown: ${threadMarkdownLink(thread)}`,
    "Humanity shows that link as the project's icon and the thread's title, so add no id, path or separate link.",
  ].join("\n")
}
