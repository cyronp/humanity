import {
  DEFAULT_PROJECT_SETTINGS,
  type Project,
  ProjectId,
  type Session,
  SessionId,
  type SessionStatus,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { DEFAULT_THREAD_FILTER, type Thread } from "@/features/sidebar/threadFilter"
import {
  type NumberKey,
  numberedThreads,
  threadAtNumber,
  threadNumberOf,
} from "@/features/sidebar/threadNumbers"

const project: Project = {
  id: ProjectId.make("p1"),
  name: "web-app",
  localPath: "/repos/web-app",
  githubFullName: null,
  gitlab: null,
  defaultBranch: "main",
  defaultAutonomy: null,
  settings: DEFAULT_PROJECT_SETTINGS,
  createdAt: "2026-11-01T00:00:00.000Z",
}

const session = (
  id: string,
  updatedAt: string,
  options: { readonly parentId?: string; readonly status?: SessionStatus } = {},
): Session => ({
  id: SessionId.make(id),
  projectId: project.id,
  provider: "claude-code",
  sdkSessionId: null,
  title: id,
  branch: "main",
  worktreePath: project.localPath,
  inWorktree: false,
  origin: "humanity",
  model: null,
  effort: null,
  autonomy: "auto",
  status: options.status ?? "idle",
  parentId: options.parentId === undefined ? null : SessionId.make(options.parentId),
  relation: options.parentId === undefined ? null : "opened",
  createdAt: updatedAt,
  updatedAt,
})

const thread = (each: Session): Thread => ({ session: each, project })

const key = (overrides: Partial<NumberKey>): NumberKey => ({
  key: "1",
  code: "Digit1",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
})

describe("threadNumberOf", () => {
  it("reads Ctrl plus a digit off a Mac and Cmd plus a digit on one", () => {
    expect(threadNumberOf(key({ ctrlKey: true, key: "3", code: "Digit3" }), false)).toBe(3)
    expect(threadNumberOf(key({ metaKey: true, key: "9", code: "Digit9" }), true)).toBe(9)
    expect(threadNumberOf(key({ ctrlKey: true, key: "2", code: "Numpad2" }), false)).toBe(2)
  })

  it("reads the physical digit on layouts where the key is a symbol", () => {
    expect(threadNumberOf(key({ ctrlKey: true, key: "&", code: "Digit1" }), false)).toBe(1)
  })

  it("ignores other modifiers, zero and the wrong platform key", () => {
    expect(threadNumberOf(key({ metaKey: true }), false)).toBeUndefined()
    expect(threadNumberOf(key({ ctrlKey: true }), true)).toBeUndefined()
    expect(threadNumberOf(key({ ctrlKey: true, altKey: true }), false)).toBeUndefined()
    expect(threadNumberOf(key({ ctrlKey: true, shiftKey: true }), false)).toBeUndefined()
    expect(threadNumberOf(key({ ctrlKey: true, key: "0", code: "Digit0" }), false)).toBeUndefined()
    expect(threadNumberOf(key({ key: "1" }), false)).toBeUndefined()
  })
})

describe("numberedThreads", () => {
  it("numbers threads in the sidebar's order, children under their parent, without ended ones", () => {
    const threads = [
      session("old", "2026-11-10T08:00:00.000Z"),
      session("new", "2026-11-10T12:00:00.000Z"),
      session("child", "2026-11-10T13:00:00.000Z", { parentId: "old" }),
      session("gone", "2026-11-10T14:00:00.000Z", { status: "ended" }),
    ].map(thread)
    expect(numberedThreads(threads, DEFAULT_THREAD_FILTER).map((each) => each.id)).toEqual([
      "new",
      "old",
      "child",
    ])
  })
})

describe("threadAtNumber", () => {
  const threads = ["a", "b", "c"].map((id) => session(id, "2026-11-10T08:00:00.000Z"))

  it("goes to the nth thread and 9 to the last, like a browser's tabs", () => {
    expect(threadAtNumber(threads, 1)?.id).toBe("a")
    expect(threadAtNumber(threads, 3)?.id).toBe("c")
    expect(threadAtNumber(threads, 9)?.id).toBe("c")
    expect(threadAtNumber(threads, 4)).toBeUndefined()
  })
})
