import { describe, expect, it } from "vitest"
import { parseRepoInput } from "@/features/github/CloneFromGitHubCard"

describe("parseRepoInput", () => {
  it("accepts owner/repo and GitHub URLs", () => {
    expect(parseRepoInput("acme/widgets")).toBe("acme/widgets")
    expect(parseRepoInput("  https://github.com/acme/widgets  ")).toBe("acme/widgets")
    expect(parseRepoInput("https://github.com/acme/widgets.git")).toBe("acme/widgets")
    expect(parseRepoInput("https://github.com/acme/my.repo/")).toBe("acme/my.repo")
    expect(parseRepoInput("git@github.com:acme/widgets.git")).toBe("acme/widgets")
  })

  it("rejects anything that is not a repository name", () => {
    expect(parseRepoInput("")).toBeUndefined()
    expect(parseRepoInput("widgets")).toBeUndefined()
    expect(parseRepoInput("acme/widgets/tree/main")).toBeUndefined()
    expect(parseRepoInput("../../etc/passwd")).toBeUndefined()
    expect(parseRepoInput("-acme/widgets")).toBeUndefined()
  })
})
