import { type Session, SessionId, type SessionStatus, ProjectId } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  isNextThreadShortcut,
  nextThreadNeedingYou,
  threadsNeedingYou,
} from "@/features/attention/nextThread"

const session = (id: string, status: SessionStatus, updatedAt: string): Session => ({
  id: SessionId.make(id),
  projectId: ProjectId.make("p"),
  provider: "claude-code",
  sdkSessionId: null,
  title: id,
  branch: "main",
  worktreePath: "/repo",
  inWorktree: false,
  origin: "humanity",
  model: null,
  effort: null,
  autonomy: "ask",
  status,
  createdAt: updatedAt,
  updatedAt,
})

const sessions = [
  session("err", "error", "2026-11-23T08:00:00.000Z"),
  session("late", "waiting_for_human", "2026-11-23T10:00:00.000Z"),
  session("busy", "running", "2026-11-23T07:00:00.000Z"),
  session("early", "waiting_for_human", "2026-11-23T09:00:00.000Z"),
]

describe("threadsNeedingYou", () => {
  it("puts waiting threads first, the longest waiting first, then errors", () => {
    expect(threadsNeedingYou(sessions).map((each) => each.id)).toEqual(["early", "late", "err"])
  })
})

describe("nextThreadNeedingYou", () => {
  it("starts at the first and goes round from the thread that is open", () => {
    expect(nextThreadNeedingYou(sessions, undefined)?.id).toBe("early")
    expect(nextThreadNeedingYou(sessions, "busy")?.id).toBe("early")
    expect(nextThreadNeedingYou(sessions, "early")?.id).toBe("late")
    expect(nextThreadNeedingYou(sessions, "err")?.id).toBe("early")
  })

  it("has nowhere to go when only the open thread needs you, or none does", () => {
    expect(nextThreadNeedingYou([sessions[1] as Session], "late")).toBeUndefined()
    expect(nextThreadNeedingYou([sessions[2] as Session], undefined)).toBeUndefined()
  })
})

describe("isNextThreadShortcut", () => {
  const press = (
    key: string,
    mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>>,
  ) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  })
  it("is Ctrl+J, or Cmd+J on a Mac", () => {
    expect(isNextThreadShortcut(press("j", { ctrlKey: true }), false)).toBe(true)
    expect(isNextThreadShortcut(press("J", { metaKey: true }), true)).toBe(true)
    expect(isNextThreadShortcut(press("j", { ctrlKey: true, shiftKey: true }), false)).toBe(false)
    expect(isNextThreadShortcut(press("j", { metaKey: true }), false)).toBe(false)
  })
})
