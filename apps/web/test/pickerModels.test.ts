import { describe, expect, it } from "vitest"
import { modelKey, pickerModels, shortModelName } from "@/features/providers/models"
import { patchFiles } from "@/features/tools/patch"
import { findRenderer } from "@/features/tools/registry"
import { toolRenderers } from "@/features/tools/renderers"

describe("pickerModels", () => {
  const gpt = { value: "gpt-codex", displayName: "GPT Codex", description: "" }

  it("puts a provider's default first when it did not report one", () => {
    expect(pickerModels("codex", [gpt]).map((model) => model.value)).toEqual([
      "default",
      "gpt-codex",
    ])
    const reported = [{ value: "default", displayName: "Default (recommended)", description: "" }]
    expect(pickerModels("claude-code", reported)).toHaveLength(1)
  })

  it("keeps Claude Code's pinned ids behind the legacy models, and none of Codex's", () => {
    const pinned = { value: "claude-sonnet-5", displayName: "Sonnet 5", description: "" }
    expect(pickerModels("claude-code", [pinned])[1]?.legacy).toBe(true)
    expect(pickerModels("codex", [gpt]).every((model) => !model.legacy)).toBe(true)
  })

  it("names the same value apart per provider, Claude Code's as before", () => {
    expect(modelKey({ provider: "claude-code", value: "default" })).toBe("default")
    expect(modelKey({ provider: "codex", value: "default" })).toBe("codex:default")
  })

  it("shortens the default's name for tight spaces", () => {
    expect(shortModelName(pickerModels("claude-code", [])[0]!)).toBe("Default")
  })
})

describe("patchFiles", () => {
  it("shows a new file's content as added lines", () => {
    const [file] = patchFiles({
      changes: [{ path: "/repo/a.txt", kind: "add", diff: "one\ntwo\n" }],
    })
    expect(file?.kind).toBe("add")
    expect(file?.hunks[0]?.lines).toEqual(["+one", "+two"])
  })

  it("reads a change's bare hunks, and where a file moves to", () => {
    const [file] = patchFiles({
      changes: [
        {
          path: "src/a.ts",
          kind: "update",
          movePath: "src/b.ts",
          diff: "@@ -1,2 +1,2 @@\n keep\n-old\n+new\n",
        },
      ],
    })
    expect(file?.movePath).toBe("src/b.ts")
    expect(file?.hunks).toHaveLength(1)
    expect(file?.hunks[0]?.lines).toEqual([" keep", "-old", "+new"])
  })

  it("shows a deleted file's content as removed lines", () => {
    const [file] = patchFiles({ changes: [{ path: "a.txt", kind: "delete", diff: "gone\n" }] })
    expect(file?.hunks[0]?.lines).toEqual(["-gone"])
  })

  it("leaves out what it cannot read", () => {
    expect(patchFiles({ changes: [{ kind: "add" }, "nonsense"] })).toEqual([])
    expect(patchFiles(null)).toEqual([])
  })

  it("has a renderer of its own", () => {
    expect(findRenderer(toolRenderers, "ApplyPatch", {}).name).toBe("ApplyPatch")
  })
})
