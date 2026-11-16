import type { KiroStatus } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { kiroLine } from "@/features/kiro/summary"

const status = (connection: KiroStatus["connection"]): KiroStatus => ({
  connection,
  models: [],
  cliVersion: null,
  kiroHome: null,
  executable: "kiro-cli",
  checkedAt: "2026-11-16T00:00:00.000Z",
})

describe("kiroLine", () => {
  it("shows what the CLI says of a login", () => {
    expect(kiroLine(status({ _tag: "Connected", label: "Kiro CLI 2.32.0" }))).toBe(
      "Kiro CLI 2.32.0",
    )
  })

  it("says what is wrong otherwise", () => {
    expect(kiroLine(status({ _tag: "SignedOut" }))).toBe("Kiro is not signed in")
    expect(kiroLine(status({ _tag: "Unavailable", reason: "not found" }))).toBe(
      "Kiro could not be started",
    )
  })
})
