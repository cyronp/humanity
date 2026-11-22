import { describe, expect, it } from "vitest"
import {
  groupCommands,
  insideTerminal,
  isPaletteShortcut,
  type PaletteCommand,
  parsePaletteQuery,
  RECENT_LIMIT,
  recentCommands,
  withRecent,
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

describe("recent commands", () => {
  it("keeps the latest first, without repeats, up to a limit", () => {
    let recent: ReadonlyArray<string> = []
    for (const id of ["a", "b", "a", "c", "d", "e", "f"]) recent = withRecent(recent, id)
    expect(recent).toEqual(["f", "e", "d", "c", "a"])
    expect(recent).toHaveLength(RECENT_LIMIT)
  })

  it("shows only the recent commands that still exist, in order", () => {
    const commands = [command("a"), command("b"), command("c")]
    expect(recentCommands(commands, ["c", "gone", "a"]).map((each) => each.id)).toEqual(["c", "a"])
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
