import type { Session, SessionStatus } from "@humanity/contracts"
import type { Thread } from "./threadFilter.ts"

export interface ThreadNode {
  readonly thread: Thread
  readonly depth: number
}

export const MAX_NESTING = 3

export const threadTree = (shown: ReadonlyArray<Thread>): ReadonlyArray<ThreadNode> => {
  const ids = new Set(shown.map((thread) => thread.session.id))
  const children = new Map<string, Array<Thread>>()
  const roots: Array<Thread> = []
  for (const thread of shown) {
    const parentId = thread.session.parentId
    if (parentId != null && parentId !== thread.session.id && ids.has(parentId)) {
      const siblings = children.get(parentId) ?? []
      siblings.push(thread)
      children.set(parentId, siblings)
    } else {
      roots.push(thread)
    }
  }
  const nodes: Array<ThreadNode> = []
  const placed = new Set<string>()
  const visit = (thread: Thread, depth: number) => {
    if (placed.has(thread.session.id)) return
    placed.add(thread.session.id)
    nodes.push({ thread, depth: Math.min(depth, MAX_NESTING) })
    for (const child of children.get(thread.session.id) ?? []) visit(child, depth + 1)
  }
  for (const root of roots) visit(root, 0)
  for (const thread of shown) visit(thread, 0)
  return nodes
}

const URGENCY: ReadonlyArray<SessionStatus> = ["waiting_for_human", "error", "running"]

export const childAttention = (
  sessionId: string,
  sessions: ReadonlyArray<Session>,
): SessionStatus | undefined => {
  const byParent = new Map<string, Array<Session>>()
  for (const session of sessions) {
    if (session.parentId == null) continue
    const siblings = byParent.get(session.parentId) ?? []
    siblings.push(session)
    byParent.set(session.parentId, siblings)
  }
  const statuses = new Set<SessionStatus>()
  const seen = new Set<string>([sessionId])
  const queue = [...(byParent.get(sessionId) ?? [])]
  while (queue.length > 0) {
    const next = queue.shift()
    if (next === undefined || seen.has(next.id)) continue
    seen.add(next.id)
    statuses.add(next.status)
    queue.push(...(byParent.get(next.id) ?? []))
  }
  return URGENCY.find((status) => statuses.has(status))
}
