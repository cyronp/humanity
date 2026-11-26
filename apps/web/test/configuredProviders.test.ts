import { planConnection, type ProviderAccount, type ProviderConnection } from "@humanity/contracts"
import { AsyncResult } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { configuredProviders } from "@/features/providers/accounts/configured"

const account = (connection: ProviderConnection): ProviderAccount => ({
  id: "default",
  name: "Default",
  isDefault: true,
  linkedFolder: false,
  active: true,
  status: {
    connection,
    models: [],
    cliVersion: null,
    home: null,
    executable: null,
    checkedAt: "2026-11-26T09:00:00.000Z",
  },
})

const signedIn = AsyncResult.success([account(planConnection("Pro"))])
const signedOut = AsyncResult.success([
  account({ _tag: "SignedOut" }),
  account({ _tag: "Unavailable", reason: "ENOENT" }),
])

describe("configuredProviders", () => {
  it("shows a provider once one of its accounts is signed in", () => {
    expect(
      configuredProviders([
        ["claude-code", signedOut],
        ["codex", signedIn],
        ["kiro", AsyncResult.success([])],
        ["antigravity", signedIn],
      ]),
    ).toEqual({ shown: ["codex", "antigravity"], reading: false })
  })

  it("keeps a provider whose accounts could not be read, to show why", () => {
    expect(configuredProviders([["kiro", AsyncResult.fail(new Error("down"))]]).shown).toEqual([
      "kiro",
    ])
  })

  it("says when accounts are still being read", () => {
    expect(
      configuredProviders([
        ["claude-code", AsyncResult.initial()],
        ["codex", signedOut],
      ]),
    ).toEqual({ shown: [], reading: true })
  })
})
