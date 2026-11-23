import { Schema } from "effect"
import { ProjectId } from "./Project.ts"
import { AgentProvider, PROVIDER_NAMES } from "./Provider.ts"
import { ReasoningEffort, SessionId } from "./Session.ts"

export const OpenedThread = Schema.Struct({
  sessionId: SessionId,
  projectId: ProjectId,
  title: Schema.String,
  provider: AgentProvider,
  model: Schema.NullOr(Schema.String),
  effort: Schema.NullOr(ReasoningEffort),
})
export type OpenedThread = typeof OpenedThread.Type

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

export const parseThreadHref = (
  href: string,
): { readonly projectId: ProjectId; readonly sessionId: SessionId } | undefined => {
  const match = THREAD_HREF.exec(href)
  const projectId = decodeSegment(match?.[1] ?? "")
  const sessionId = decodeSegment(match?.[2] ?? "")
  if (!projectId || !sessionId) return undefined
  return { projectId: ProjectId.make(projectId), sessionId: SessionId.make(sessionId) }
}

export const threadMarkdownLink = (
  thread: Pick<OpenedThread, "projectId" | "sessionId" | "title">,
): string =>
  `[${thread.title.replace(/[\\[\]]/g, "\\$&")}](${threadHref(thread.projectId, thread.sessionId)})`

const MARKDOWN_LINK_START = "](/projects/"

const endsHref = (character: string) => character === ")" || /\s/.test(character)

const firstMarkdownThreadHref = (text: string): string | undefined => {
  let from = 0
  for (;;) {
    const start = text.indexOf(MARKDOWN_LINK_START, from)
    if (start === -1) return undefined
    const hrefStart = start + 2
    const pathStart = start + MARKDOWN_LINK_START.length
    let end = pathStart
    while (end < text.length && !endsHref(text.charAt(end))) end++
    if (end > pathStart && text.charAt(end) === ")") return text.slice(hrefStart, end)
    from = Math.max(end, start + 1)
  }
}

export const openedThreadIn = (
  text: string,
): { readonly projectId: ProjectId; readonly sessionId: SessionId } | undefined => {
  const href = firstMarkdownThreadHref(text)
  return href === undefined ? undefined : parseThreadHref(href)
}

export const formatOpenedThread = (thread: OpenedThread): string => {
  const runsOn = [
    thread.model ?? "the default model",
    ...(thread.effort === null ? [] : [`${thread.effort} effort`]),
  ].join(", ")
  return [
    `Opened the thread "${thread.title}" on ${PROVIDER_NAMES[thread.provider]}, ${runsOn}. It is working now.`,
    `When you tell the human about it, link to it inline in your sentence, with exactly this markdown: ${threadMarkdownLink(thread)}`,
    "Humanity shows that link as the project's icon and the thread's title, so add no id, path or separate link.",
    `To wait for it to finish, or to read what it did, call thread_result with thread_id "${thread.sessionId}".`,
  ].join("\n")
}
