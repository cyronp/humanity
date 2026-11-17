import type { BundledLanguage } from "shiki"
import { describe, expect, it } from "vitest"
import {
  CodeTooLongToHighlight,
  highlight,
  MAX_HIGHLIGHT_LENGTH,
} from "@/features/diff/highlighter"

describe("highlight", () => {
  it("colours a grammar's tokens for both themes", async () => {
    const lines = await highlight("const answer = 42", "typescript")
    const keyword = lines[0]?.find((token) => token.content.trim() === "const")
    expect(keyword?.style["--shiki-light"]).toMatch(/^#/)
    expect(keyword?.style["--shiki-dark"]).toMatch(/^#/)
  })

  it("takes a fence's alias and plain text without a grammar", async () => {
    expect(await highlight("echo hi", "sh")).toHaveLength(1)
    const plain = await highlight("a\nb", "text" as BundledLanguage)
    expect(plain.map((line) => line[0]?.content)).toEqual(["a", "b"])
  })

  it("fails for a language Shiki does not know, so callers show plain text", async () => {
    await expect(highlight("x", "no-such-language" as BundledLanguage)).rejects.toThrow()
  })

  it("leaves code too long to tokenize quickly to plain text", async () => {
    await expect(
      highlight("x".repeat(MAX_HIGHLIGHT_LENGTH + 1), "typescript"),
    ).rejects.toBeInstanceOf(CodeTooLongToHighlight)
  })
})
