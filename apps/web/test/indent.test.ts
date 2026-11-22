import { describe, expect, it } from "vitest"
import { detectIndent } from "../src/features/files/indent.ts"

describe("detectIndent", () => {
  it("finds tabs", () => {
    expect(detectIndent("a {\n\tb\n\t\tc\n}\n")).toEqual({ kind: "tabs" })
  })

  it("finds the step of space indentation", () => {
    expect(detectIndent("a:\n  b:\n    c: 1\n  d: 2\n")).toEqual({ kind: "spaces", size: 2 })
    expect(detectIndent("def f():\n    if x:\n        y()\n    return 1\n")).toEqual({
      kind: "spaces",
      size: 4,
    })
  })

  it("ignores blank lines and says nothing about a flat file", () => {
    expect(detectIndent("a\n\nb\n")).toBeUndefined()
    expect(detectIndent("")).toBeUndefined()
  })

  it("follows what most indented lines use", () => {
    expect(detectIndent("a\n\tb\n\tc\n\td\n  e\n")).toEqual({ kind: "tabs" })
  })
})
