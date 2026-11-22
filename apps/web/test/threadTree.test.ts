import {
  DEFAULT_PROJECT_SETTINGS,
  type Project,
  ProjectId,
  type Session,
  SessionId,
  type SessionStatus,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import type { Thread } from "@/features/sidebar/threadFilter"
import { childAttention, MAX_NESTING, threadTree } from "@/features/sidebar/threadTree"

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

const session = (id: string, parentId: string | null, status: SessionStatus = "idle"): Session => ({
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
  status,
  parentId: parentId === null ? null : SessionId.make(parentId),
  relation: parentId === null ? null : "opened",
  createdAt: "2026-11-10T10:00:00.000Z",
  updatedAt: "2026-11-10T10:00:00.000Z",
})

const thread = (each: Session): Thread => ({ session: each, project })

const shape = (sessions: ReadonlyArray<Session>) =>
  threadTree(sessions.map(thread)).map((node) => `${node.thread.session.id}:${node.depth}`)

describe("threadTree", () => {
  it("puts each thread under the thread that opened it, keeping the order of the rest", () => {
    expect(
      shape([
        session("a", null),
        session("b", null),
        session("a1", "a"),
        session("a1x", "a1"),
        session("a2", "a"),
      ]),
    ).toEqual(["a:0", "a1:1", "a1x:2", "a2:1", "b:0"])
  })

  it("shows a thread whose parent is filtered out at the top level", () => {
    expect(shape([session("a1", "a"), session("b", null)])).toEqual(["a1:0", "b:0"])
  })

  it("survives a cycle and caps the indentation", () => {
    expect(shape([session("x", "y"), session("y", "x")])).toEqual(["x:0", "y:1"])
    const chain = Array.from({ length: 6 }, (_, index) =>
      session(`t${index}`, index === 0 ? null : `t${index - 1}`),
    )
    expect(Math.max(...threadTree(chain.map(thread)).map((node) => node.depth))).toBe(MAX_NESTING)
  })
})

describe("childAttention", () => {
  it("reports the most urgent status among the threads a thread opened, at any depth", () => {
    const sessions = [
      session("a", null),
      session("a1", "a", "running"),
      session("a1x", "a1", "waiting_for_human"),
      session("a2", "a", "error"),
      session("b", null, "running"),
    ]
    expect(childAttention("a", sessions)).toBe("waiting_for_human")
    expect(childAttention("a1", sessions)).toBe("waiting_for_human")
    expect(childAttention("a2", sessions)).toBeUndefined()
    expect(childAttention("b", sessions)).toBeUndefined()
  })

  it("ignores children that are done, interrupted or ended", () => {
    const sessions = [
      session("a", null),
      session("a1", "a", "idle"),
      session("a2", "a", "ended"),
      session("a3", "a", "interrupted"),
    ]
    expect(childAttention("a", sessions)).toBeUndefined()
  })
})
