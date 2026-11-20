import type { AntigravityStatus } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { antigravityLine, antigravitySignInCommand } from "@/features/antigravity/summary"

const status = (connection: AntigravityStatus["connection"]): AntigravityStatus => ({
  connection,
  models: [],
  cliVersion: null,
  geminiHome: null,
  executable: "agy",
  checkedAt: "2026-11-20T00:00:00.000Z",
})

describe("antigravityLine", () => {
  it("shows what the CLI says of a login", () => {
    expect(antigravityLine(status({ _tag: "Connected", label: "Antigravity CLI 1.5.12" }))).toBe(
      "Antigravity CLI 1.5.12",
    )
  })

  it("says what is wrong otherwise", () => {
    expect(antigravityLine(status({ _tag: "SignedOut" }))).toBe("Antigravity is not signed in")
    expect(antigravityLine(status({ _tag: "Unavailable", reason: "not found" }))).toBe(
      "Antigravity could not be started",
    )
  })
})

describe("antigravitySignInCommand", () => {
  it("signs the default login in with the CLI's own sign-in", () => {
    expect(antigravitySignInCommand({ geminiHome: null, executable: "agy" })).toBe(
      "agy acp --login",
    )
  })

  it("signs an added account in inside its own folder", () => {
    expect(
      antigravitySignInCommand({ geminiHome: "/home/me/.gemini-work", executable: "agy" }),
    ).toBe("GEMINI_HOME=/home/me/.gemini-work AGY_ACP_FORCE_FILE_STORAGE=1 agy acp --login")
  })
})
