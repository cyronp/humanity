import { RECENT_MENTION_LIMIT } from "@humanity/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readRecentMentions, rememberMentions } from "../src/features/chat/recentMentions.ts"

const storage = () => {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

describe("recent mentions", () => {
  beforeEach(() => vi.stubGlobal("localStorage", storage()))
  afterEach(() => vi.unstubAllGlobals())

  it("keeps the latest mentions first, once each, per project", () => {
    rememberMentions("p1", ["a.ts", "b.ts"])
    rememberMentions("p1", ["c.ts", "a.ts"])
    rememberMentions("p2", ["z.ts"])
    expect(readRecentMentions("p1")).toEqual(["c.ts", "a.ts", "b.ts"])
    expect(readRecentMentions("p2")).toEqual(["z.ts"])
    expect(readRecentMentions("p3")).toEqual([])
  })

  it("keeps at most the limit", () => {
    const many = Array.from({ length: RECENT_MENTION_LIMIT + 5 }, (_, at) => `f${at}.ts`)
    rememberMentions("p", many)
    expect(readRecentMentions("p")).toEqual(many.slice(0, RECENT_MENTION_LIMIT))
  })

  it("reads nothing from damaged or missing storage", () => {
    localStorage.setItem("humanity.recentMentions", "{not json")
    expect(readRecentMentions("p")).toEqual([])
    vi.stubGlobal("localStorage", undefined)
    expect(readRecentMentions("p")).toEqual([])
    expect(rememberMentions("p", ["a.ts"])).toEqual(["a.ts"])
  })
})
