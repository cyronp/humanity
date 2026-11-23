import { describe, expect, it } from "vitest"
import {
  applySuggestion,
  asksForEnded,
  filterSuggestions,
  hasFilters,
  parseFilters,
  threadMatches,
} from "@/features/palette/filters"
import {
  flattenPages,
  frecency,
  frequentCommands,
  groupCommands,
  insideTerminal,
  isPaletteShortcut,
  type PaletteCommand,
  parsePaletteQuery,
  rankedByUse,
  RECENT_LIMIT,
  splitPaletteInput,
  usageFromRecent,
  withUse,
} from "@/features/palette/registry"

const key = (
  name: string,
  modifiers: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {},
) => ({
  key: name,
  ctrlKey: modifiers.ctrl ?? false,
  metaKey: modifiers.meta ?? false,
  shiftKey: modifiers.shift ?? false,
  altKey: modifiers.alt ?? false,
})

const command = (id: string, group = "General"): PaletteCommand => ({
  id,
  title: id,
  group,
  run: () => {},
})

describe("parsePaletteQuery", () => {
  it("reads a prefix as the kind of result, and the rest as the text", () => {
    expect(parsePaletteQuery("> fork")).toEqual({ mode: "actions", text: "fork" })
    expect(parsePaletteQuery("#login")).toEqual({ mode: "threads", text: "login" })
    expect(parsePaletteQuery("  ? timeout error ")).toEqual({
      mode: "messages",
      text: "timeout error",
    })
    expect(parsePaletteQuery(" settings ")).toEqual({ mode: "all", text: "settings" })
    expect(parsePaletteQuery("")).toEqual({ mode: "all", text: "" })
    expect(parsePaletteQuery("@src/app")).toEqual({ mode: "files", text: "src/app" })
    expect(parsePaletteQuery("/review")).toEqual({ mode: "skills", text: "review" })
  })

  it("keeps the trailing space of what follows the prefix", () => {
    expect(splitPaletteInput(" #is:waiting ")).toEqual({
      mode: "threads",
      prefix: "#",
      body: "is:waiting ",
    })
    expect(splitPaletteInput("fork ")).toEqual({ mode: "all", prefix: "", body: "fork " })
  })
})

describe("isPaletteShortcut", () => {
  it("opens on Ctrl+K and Ctrl+Shift+P, or Cmd on a Mac", () => {
    expect(isPaletteShortcut(key("k", { ctrl: true }), false)).toBe(true)
    expect(isPaletteShortcut(key("K", { ctrl: true }), false)).toBe(true)
    expect(isPaletteShortcut(key("P", { ctrl: true, shift: true }), false)).toBe(true)
    expect(isPaletteShortcut(key("k", { meta: true }), true)).toBe(true)
    expect(isPaletteShortcut(key("k", { meta: true }), false)).toBe(false)
    expect(isPaletteShortcut(key("k", { ctrl: true }), true)).toBe(false)
    expect(isPaletteShortcut(key("p", { ctrl: true }), false)).toBe(false)
    expect(isPaletteShortcut(key("k", { ctrl: true, alt: true }), false)).toBe(false)
    expect(isPaletteShortcut(key("k", { ctrl: true, shift: true }), false)).toBe(false)
  })

  it("does not see a terminal where there is no element", () => {
    expect(insideTerminal(null)).toBe(false)
  })
})

describe("ranking by use", () => {
  const DAY = 86_400_000
  const now = 100 * DAY

  it("counts each use and remembers the last one", () => {
    let usage = withUse({}, "a", now - DAY)
    usage = withUse(usage, "a", now)
    expect(usage.a).toEqual({ count: 2, last: now })
  })

  it("weighs often and recent above once and long ago", () => {
    const usage = {
      often: { count: 6, last: now - 2 * DAY },
      once: { count: 1, last: now },
      stale: { count: 6, last: now - 90 * DAY },
    }
    expect(frecency(usage.often, now)).toBeGreaterThan(frecency(usage.once, now))
    expect(frecency(usage.once, now)).toBeGreaterThan(frecency(usage.stale, now))
    expect(frecency(undefined, now)).toBe(0)
  })

  it("shows the most used commands that still exist, up to a limit", () => {
    const commands = ["a", "b", "c", "d", "e", "f", "g"].map((id) => command(id))
    const usage = Object.fromEntries(
      ["a", "b", "c", "d", "e", "f", "gone"].map((id, index) => [
        id,
        { count: index + 1, last: now },
      ]),
    )
    const shown = frequentCommands(commands, usage, now).map((each) => each.id)
    expect(shown).toEqual(["f", "e", "d", "c", "b"])
    expect(shown).toHaveLength(RECENT_LIMIT)
  })

  it("keeps the given order among items never used", () => {
    const ranked = rankedByUse(["x", "y", "z"], (id) => id, { z: { count: 1, last: now } }, now)
    expect(ranked).toEqual(["z", "x", "y"])
  })

  it("carries over the old list of recent commands, the latest first", () => {
    const usage = usageFromRecent(["c", "a"], now)
    expect(
      frequentCommands([command("a"), command("c")], usage, now).map((each) => each.id),
    ).toEqual(["c", "a"])
  })
})

describe("flattenPages", () => {
  it("lists a step's choices under their parent's name, so a search finds them", () => {
    const parent: PaletteCommand = {
      id: "theme",
      title: "Color theme",
      group: "General",
      keywords: ["colors"],
      page: { title: "Color theme", items: [{ ...command("theme.midnight"), title: "Midnight" }] },
    }
    expect(flattenPages([parent, command("other")])).toEqual([
      {
        id: "theme.midnight",
        title: "Color theme: Midnight",
        group: "General",
        keywords: ["colors"],
        run: expect.any(Function),
      },
    ])
  })
})

describe("thread filters", () => {
  const session = { status: "waiting_for_human", provider: "codex", branch: "feat/login" } as const

  it("separates filters from the words to search for", () => {
    const parsed = parseFilters('login is:waiting project:"my app" provider:codex')
    expect(parsed.text).toBe("login")
    expect(parsed.filters).toEqual({
      is: ["waiting"],
      project: ["my app"],
      provider: ["codex"],
      branch: [],
    })
    expect(hasFilters(parsed.filters)).toBe(true)
    expect(hasFilters(parseFilters("just words").filters)).toBe(false)
  })

  it("keeps an unknown key as a word", () => {
    expect(parseFilters("http://x foo:bar").text).toBe("http://x foo:bar")
  })

  it("matches every key, and any of the values given for one key", () => {
    const filters = (input: string) => parseFilters(input).filters
    expect(threadMatches(session, "Humanity", filters("is:wait"))).toBe(true)
    expect(threadMatches(session, "Humanity", filters("is:running is:waiting"))).toBe(true)
    expect(threadMatches(session, "Humanity", filters("is:running"))).toBe(false)
    expect(threadMatches(session, "Humanity", filters("is:open project:human"))).toBe(true)
    expect(threadMatches(session, "Humanity", filters("project:other"))).toBe(false)
    expect(threadMatches(session, "Humanity", filters("provider:codex branch:login"))).toBe(true)
    expect(threadMatches(session, "Humanity", filters("provider:claude"))).toBe(false)
    expect(
      threadMatches(
        { ...session, provider: "claude-code" },
        "Humanity",
        filters("provider:claude"),
      ),
    ).toBe(true)
    expect(asksForEnded(filters("is:end"))).toBe(true)
    expect(asksForEnded(filters("is:open"))).toBe(false)
  })

  it("suggests keys, then values, and puts the chosen one in place", () => {
    const keysFor = (input: string) =>
      filterSuggestions(parseFilters(input).last, ["Humanity", "my app"], []).map(
        (each) => each.label,
      )
    expect(keysFor("pro")).toEqual(["project:", "provider:"])
    expect(keysFor("p")).toEqual([])
    expect(keysFor("is:wa")).toEqual(["is:waiting"])
    expect(keysFor("project:")).toEqual(["project:Humanity", "project:my app"])
    expect(keysFor("login ")).toEqual([])

    const input = "login project:my"
    const last = parseFilters(input).last
    const suggestion = filterSuggestions(last, ["my app"], [])[0]
    expect(last === undefined || suggestion === undefined).toBe(false)
    if (last !== undefined && suggestion !== undefined) {
      expect(applySuggestion(input, last, suggestion.insert)).toBe('login project:"my app" ')
    }
  })
})

describe("groupCommands", () => {
  it("groups commands in the order their groups first appear", () => {
    const grouped = groupCommands([
      command("fork", "This thread"),
      command("new"),
      command("stop", "This thread"),
    ])
    expect(grouped.map(([group, items]) => [group, items.map((each) => each.id)])).toEqual([
      ["This thread", ["fork", "stop"]],
      ["General", ["new"]],
    ])
  })
})
