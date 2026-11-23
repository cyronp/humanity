import type { MessageHit, Project, Session, SessionStatus } from "@humanity/contracts"

export type ThreadOrder = "newest" | "oldest"

export interface ThreadFilter {
  readonly projectIds: ReadonlyArray<string>
  readonly statuses: ReadonlyArray<SessionStatus>
  readonly order: ThreadOrder
}

export const STATUS_OPTIONS: ReadonlyArray<{
  readonly value: SessionStatus
  readonly label: string
}> = [
  { value: "waiting_for_human", label: "Waiting for you" },
  { value: "running", label: "Running" },
  { value: "idle", label: "Idle" },
  { value: "interrupted", label: "Interrupted" },
  { value: "error", label: "Stopped with an error" },
  { value: "ended", label: "Ended" },
]

export const DEFAULT_THREAD_FILTER: ThreadFilter = {
  projectIds: [],
  statuses: ["waiting_for_human", "running", "idle", "interrupted", "error"],
  order: "newest",
}

export interface Thread {
  readonly session: Session
  readonly project: Project
}

const sameMembers = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((item) => b.includes(item))

export const isDefaultFilter = (filter: ThreadFilter): boolean =>
  filter.projectIds.length === 0 &&
  sameMembers(filter.statuses, DEFAULT_THREAD_FILTER.statuses) &&
  filter.order === DEFAULT_THREAD_FILTER.order

export type MessageMatches = ReadonlyMap<string, MessageHit>

const NO_MATCHES: MessageMatches = new Map()

export const firstHitPerThread = (hits: ReadonlyArray<MessageHit>): MessageMatches => {
  const matches = new Map<string, MessageHit>()
  for (const hit of hits) if (!matches.has(hit.sessionId)) matches.set(hit.sessionId, hit)
  return matches
}

export const matchesQuery = (thread: Thread, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [thread.session.title, thread.project.name, thread.session.branch]
    .join("\n")
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}

export const selectThreads = (
  threads: ReadonlyArray<Thread>,
  query: string,
  filter: ThreadFilter,
  messages: MessageMatches = NO_MATCHES,
): ReadonlyArray<Thread> => {
  const projectIds = filter.projectIds.filter((id) =>
    threads.some((thread) => thread.project.id === id),
  )
  const sign = filter.order === "newest" ? -1 : 1
  return threads
    .filter(
      (thread) =>
        (projectIds.length === 0 || projectIds.includes(thread.project.id)) &&
        filter.statuses.includes(thread.session.status) &&
        (matchesQuery(thread, query) || messages.has(thread.session.id)),
    )
    .toSorted((a, b) => sign * (Date.parse(a.session.updatedAt) - Date.parse(b.session.updatedAt)))
}

export const selectHistory = (
  threads: ReadonlyArray<Thread>,
  query: string,
  filter: ThreadFilter,
  messages: MessageMatches = NO_MATCHES,
): ReadonlyArray<Thread> =>
  selectThreads(
    threads,
    query,
    { projectIds: filter.projectIds, statuses: ["ended"], order: "newest" },
    messages,
  )

const STORAGE_KEY = "humanity.threadFilter"

const isStatus = (value: unknown): value is SessionStatus =>
  STATUS_OPTIONS.some((option) => option.value === value)

export const readStoredFilter = (): ThreadFilter => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_THREAD_FILTER
    const { projectIds, statuses, order } = parsed as Record<string, unknown>
    return {
      projectIds: Array.isArray(projectIds)
        ? projectIds.filter((id): id is string => typeof id === "string")
        : DEFAULT_THREAD_FILTER.projectIds,
      statuses: Array.isArray(statuses)
        ? statuses.filter(isStatus)
        : DEFAULT_THREAD_FILTER.statuses,
      order: order === "oldest" ? "oldest" : "newest",
    }
  } catch {
    return DEFAULT_THREAD_FILTER
  }
}

export const storeFilter = (filter: ThreadFilter) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter))
  } catch {}
}
