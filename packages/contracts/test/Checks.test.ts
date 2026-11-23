import { describe, expect, it } from "vitest"
import { CHECKS_MESSAGE_LINES, checksMessage } from "../src/index.ts"

const result = (output: string) => ({
  terminalId: "t1",
  command: "npm run lint && npm test",
  outcome: "failed" as const,
  exitCode: 2,
  output,
})

describe("checksMessage", () => {
  it("names the command and exit code and quotes the output", () => {
    const message = checksMessage(result("FAIL a.test.ts\nexpected 1\n"))
    expect(message).toBe(
      [
        "The checks failed (exit code 2): `npm run lint && npm test`",
        "",
        "Their output:",
        "```",
        "FAIL a.test.ts",
        "expected 1",
        "```",
        "",
        "Fix what fails, then run the checks again.",
      ].join("\n"),
    )
  })

  it("keeps the last lines of a long output, in a fence its backticks cannot close", () => {
    const lines = Array.from({ length: CHECKS_MESSAGE_LINES + 5 }, (_, index) => `line ${index}`)
    const message = checksMessage(result(`${lines.join("\n")}\n\`\`\`\`js`))
    expect(message).toContain(`Their last ${CHECKS_MESSAGE_LINES} lines of output:`)
    expect(message).not.toContain("line 5\n")
    expect(message).toContain("`````\n")
  })
})
