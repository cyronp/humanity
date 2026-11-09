import { describe, expect, it } from "vitest"
import { simulateEdit, simulateWrite } from "../src/index.ts"

describe("simulateEdit", () => {
  it("replaces a unique occurrence", () => {
    expect(
      simulateEdit("const a = 1\nconst b = 2\n", { old_string: "a = 1", new_string: "a = 10" }),
    ).toEqual({ ok: true, content: "const a = 10\nconst b = 2\n" })
  })

  it("fails when old_string is not in the file", () => {
    const result = simulateEdit("hello\n", { old_string: "goodbye", new_string: "x" })
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: expect.stringMatching(/not found/) })
  })

  it("fails on an ambiguous match unless replace_all is set", () => {
    const original = "x = 1\nx = 1\n"
    const ambiguous = simulateEdit(original, { old_string: "x = 1", new_string: "x = 2" })
    expect(ambiguous).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/matches 2 places/),
    })

    expect(
      simulateEdit(original, { old_string: "x = 1", new_string: "x = 2", replace_all: true }),
    ).toEqual({ ok: true, content: "x = 2\nx = 2\n" })
  })

  it("replace_all with a single occurrence behaves like a normal edit", () => {
    expect(
      simulateEdit("only once\n", { old_string: "once", new_string: "1x", replace_all: true }),
    ).toEqual({ ok: true, content: "only 1x\n" })
  })

  it("inserts replacement text literally, including $ patterns", () => {
    expect(simulateEdit("price\n", { old_string: "price", new_string: "$& costs $1" })).toEqual({
      ok: true,
      content: "$& costs $1\n",
    })
    expect(
      simulateEdit("a a\n", { old_string: "a", new_string: "$&$&", replace_all: true }),
    ).toEqual({ ok: true, content: "$&$& $&$&\n" })
  })

  it("fails when the edit would change nothing", () => {
    expect(simulateEdit("same\n", { old_string: "same", new_string: "same" }).ok).toBe(false)
  })

  it("treats an empty old_string as creating an empty or missing file", () => {
    expect(simulateEdit("", { old_string: "", new_string: "new file\n" })).toEqual({
      ok: true,
      content: "new file\n",
    })
    expect(simulateEdit("existing\n", { old_string: "", new_string: "x" }).ok).toBe(false)
  })

  it("matches LF input against a CRLF file and keeps the file's line endings", () => {
    const original = "one\r\ntwo\r\nthree\r\n"
    expect(simulateEdit(original, { old_string: "one\ntwo", new_string: "1\n2\n2.5" })).toEqual({
      ok: true,
      content: "1\r\n2\r\n2.5\r\nthree\r\n",
    })
  })

  it("deletes text when new_string is empty", () => {
    expect(simulateEdit("keep\ndrop\n", { old_string: "drop\n", new_string: "" })).toEqual({
      ok: true,
      content: "keep\n",
    })
  })
})

describe("simulateWrite", () => {
  it("replaces the whole file with the given content", () => {
    expect(simulateWrite({ content: "brand new\n" })).toEqual({ ok: true, content: "brand new\n" })
  })
})
