import { terminalLabel } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { cycleTerminal, parseFlag, pickActive } from "@/features/terminal/dock"
import { type KeyPress, terminalCommand } from "@/features/terminal/keys"
import { PALETTES, rgbaToHex } from "@/features/terminal/theme"

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  type: "keydown",
  key,
  code: key === "`" || key === "~" ? "Backquote" : `Key${key.toUpperCase()}`,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...modifiers,
})

const windows = { mac: false, hasSelection: false }
const selected = { mac: false, hasSelection: true }
const mac = { mac: true, hasSelection: false }

describe("terminalCommand", () => {
  it("lets Ctrl+C interrupt, unless text is selected, where it copies", () => {
    expect(terminalCommand(press("c", { ctrlKey: true }), windows)).toBeUndefined()
    expect(terminalCommand(press("c", { ctrlKey: true }), selected)).toBe("copy")
    expect(terminalCommand(press("C", { ctrlKey: true, shiftKey: true }), windows)).toBe("copy")
  })

  it("pastes with Ctrl+V, Ctrl+Shift+V and Shift+Insert", () => {
    expect(terminalCommand(press("v", { ctrlKey: true }), windows)).toBe("paste")
    expect(terminalCommand(press("V", { ctrlKey: true, shiftKey: true }), windows)).toBe("paste")
    expect(terminalCommand(press("Insert", { shiftKey: true }), windows)).toBe("paste")
  })

  it("leaves the shell's own keys alone", () => {
    expect(terminalCommand(press("a", { ctrlKey: true }), windows)).toBeUndefined()
    expect(terminalCommand(press("r", { ctrlKey: true }), windows)).toBeUndefined()
    expect(terminalCommand(press("d", { ctrlKey: true }), windows)).toBeUndefined()
    expect(terminalCommand(press("x"), windows)).toBeUndefined()
    expect(terminalCommand(press("b", { altKey: true }), windows)).toBeUndefined()
  })

  it("finds, selects all, and handles the dock's keys", () => {
    expect(terminalCommand(press("f", { ctrlKey: true }), windows)).toBe("find")
    expect(terminalCommand(press("A", { ctrlKey: true, shiftKey: true }), windows)).toBe(
      "select-all",
    )
    expect(terminalCommand(press("`", { ctrlKey: true }), windows)).toBe("toggle-dock")
    expect(terminalCommand(press("~", { ctrlKey: true, shiftKey: true }), windows)).toBe(
      "new-terminal",
    )
    expect(terminalCommand(press("PageDown", { ctrlKey: true }), windows)).toBe("next-terminal")
    expect(terminalCommand(press("PageUp", { ctrlKey: true }), windows)).toBe("previous-terminal")
  })

  it("uses Cmd on a Mac and leaves every Ctrl key to the shell", () => {
    expect(terminalCommand(press("c", { metaKey: true }), { ...mac, hasSelection: true })).toBe(
      "copy",
    )
    expect(terminalCommand(press("c", { metaKey: true }), mac)).toBeUndefined()
    expect(terminalCommand(press("v", { metaKey: true }), mac)).toBe("paste")
    expect(terminalCommand(press("f", { metaKey: true }), mac)).toBe("find")
    expect(terminalCommand(press("c", { ctrlKey: true }), { ...mac, hasSelection: true })).toBe(
      undefined,
    )
    expect(terminalCommand(press("`", { ctrlKey: true }), mac)).toBe("toggle-dock")
  })
})

describe("the terminal dock", () => {
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }]

  it("shows the tab asked for while it exists, else the last one", () => {
    expect(pickActive(tabs, "b")).toBe("b")
    expect(pickActive(tabs, "gone")).toBe("c")
    expect(pickActive(tabs, undefined)).toBe("c")
    expect(pickActive([], "a")).toBeUndefined()
  })

  it("moves between tabs, wrapping around", () => {
    expect(cycleTerminal(tabs, "a", 1)).toBe("b")
    expect(cycleTerminal(tabs, "c", 1)).toBe("a")
    expect(cycleTerminal(tabs, "a", -1)).toBe("c")
    expect(cycleTerminal([], "a", 1)).toBeUndefined()
  })

  it("reads a stored on/off flag, else the default", () => {
    expect(parseFlag("1", false)).toBe(true)
    expect(parseFlag("0", true)).toBe(false)
    expect(parseFlag(null, true)).toBe(true)
    expect(parseFlag("yes", false)).toBe(false)
  })

  it("names a tab by its title, else by its folder", () => {
    const base = { ordinal: 2, cwd: "C:\\code\\humanity\\", title: null }
    expect(terminalLabel(base)).toBe("humanity")
    expect(terminalLabel({ ...base, cwd: "/home/me/project" })).toBe("project")
    expect(terminalLabel({ ...base, title: "dev server" })).toBe("dev server")
    expect(terminalLabel({ ...base, title: "  " })).toBe("humanity")
    expect(terminalLabel({ ...base, cwd: "/" })).toBe("Terminal 2")
  })
})

describe("terminal colors", () => {
  it("writes colors as xterm reads them", () => {
    expect(rgbaToHex(255, 0, 16)).toBe("#ff0010")
    expect(rgbaToHex(0, 0, 0, 64)).toBe("#00000040")
  })

  it("has every ANSI color for both themes", () => {
    expect(Object.keys(PALETTES.light)).toHaveLength(16)
    expect(Object.keys(PALETTES.dark)).toEqual(Object.keys(PALETTES.light))
  })
})
