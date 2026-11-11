import {
  type Project,
  ProjectId,
  type Session,
  SessionId,
  type SessionStatus,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_THREAD_FILTER,
  isDefaultFilter,
  selectThreads,
  type Thread,
} from "@/features/sidebar/threadFilter"

const project = (id: string, name: string): Project => ({
  id: ProjectId.make(id),
  name,
  localPath: `/repos/${name}`,
  githubFullName: null,
  defaultBranch: "main",
  policy: { rules: [] },
  createdAt: "2026-11-01T00:00:00.000Z",
})

const web = project("p1", "web-app")
const api = project("p2", "billing-api")

const thread = (
  id: string,
  owner: Project,
  title: string,
  status: SessionStatus,
  updatedAt: string,
): Thread => {
  const session: Session = {
    id: SessionId.make(id),
    projectId: owner.id,
    sdkSessionId: null,
    title,
    branch: `humanity/${id}-${title.toLowerCase().replaceAll(" ", "-")}`,
    worktreePath: `/home/me/.humanity/worktrees/${owner.id}/${id}`,
    model: null,
    autonomy: "ask",
    status,
    createdAt: updatedAt,
    updatedAt,
  }
  return { session, project: owner }
}

const threads = [
  thread("a", web, "Fix login bug", "idle", "2026-11-10T10:00:00.000Z"),
  thread("b", api, "Add invoices", "waiting_for_human", "2026-11-10T12:00:00.000Z"),
  thread("c", web, "Dark mode", "ended", "2026-11-10T14:00:00.000Z"),
  thread("d", api, "Retry webhooks", "running", "2026-11-10T08:00:00.000Z"),
]

const ids = (selected: ReadonlyArray<Thread>) => selected.map((t) => t.session.id)

describe("selectThreads", () => {
  it("shows every thread that is not over, newest first, by default", () => {
    expect(ids(selectThreads(threads, "", DEFAULT_THREAD_FILTER))).toEqual(["b", "a", "d"])
  })

  it("searches titles, project names and branches, every word anywhere", () => {
    const search = (query: string) => ids(selectThreads(threads, query, DEFAULT_THREAD_FILTER))
    expect(search("LOGIN")).toEqual(["a"])
    expect(search("billing")).toEqual(["b", "d"])
    expect(search("humanity/d-")).toEqual(["d"])
    expect(search("web fix")).toEqual(["a"])
    expect(search("web invoices")).toEqual([])
    expect(search("   ")).toEqual(["b", "a", "d"])
  })

  it("filters by project and by state, and sorts oldest first on request", () => {
    expect(
      ids(selectThreads(threads, "", { ...DEFAULT_THREAD_FILTER, projectIds: [api.id] })),
    ).toEqual(["b", "d"])
    expect(
      ids(
        selectThreads(threads, "", {
          projectIds: [],
          statuses: ["ended", "idle"],
          order: "oldest",
        }),
      ),
    ).toEqual(["a", "c"])
  })

  it("ignores a chosen project that no longer exists", () => {
    const filter = { ...DEFAULT_THREAD_FILTER, projectIds: ["gone"] }
    expect(ids(selectThreads(threads, "", filter))).toEqual(["b", "a", "d"])
  })
})

describe("isDefaultFilter", () => {
  it("does not care about the order states were ticked in", () => {
    expect(isDefaultFilter(DEFAULT_THREAD_FILTER)).toBe(true)
    expect(
      isDefaultFilter({
        ...DEFAULT_THREAD_FILTER,
        statuses: [...DEFAULT_THREAD_FILTER.statuses].reverse(),
      }),
    ).toBe(true)
    expect(isDefaultFilter({ ...DEFAULT_THREAD_FILTER, order: "oldest" })).toBe(false)
  })
})
