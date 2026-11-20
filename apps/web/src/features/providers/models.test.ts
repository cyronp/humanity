import { describe, expect, it } from "vitest"
import { offeredProviders } from "./models.ts"

const ALL = ["claude-code", "codex", "kiro", "antigravity"] as const

describe("offeredProviders", () => {
  it("offers only the providers someone is signed in to", () => {
    expect(
      offeredProviders(
        ALL,
        "claude-code",
        { "claude-code": true, codex: false, kiro: true, antigravity: true },
        false,
      ),
    ).toEqual(["claude-code", "kiro", "antigravity"])
  })

  it("keeps the provider already chosen, signed in or not", () => {
    expect(
      offeredProviders(
        ALL,
        "codex",
        { "claude-code": true, codex: false, kiro: false, antigravity: false },
        false,
      ),
    ).toEqual(["claude-code", "codex"])
  })

  it("offers an open thread its own provider and no other", () => {
    expect(
      offeredProviders(
        ALL,
        "antigravity",
        { "claude-code": true, codex: true, kiro: true, antigravity: true },
        true,
      ),
    ).toEqual(["antigravity"])
  })
})
