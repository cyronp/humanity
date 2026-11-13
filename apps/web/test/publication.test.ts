import type { Branch, BranchPublication, FileDiff, PullRequestCheck } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  baseBranches,
  commitPaths,
  forgeTerms,
  needsPush,
  remoteStatus,
  summarizeChecks,
} from "@/features/session/panel/publication"

const file = (filePath: string, extra: Partial<FileDiff> = {}): FileDiff => ({
  filePath,
  kind: "modify",
  binary: false,
  hunks: [],
  ...extra,
})

const branch = (name: string, isRemote = false): Branch => ({
  name,
  isCurrent: false,
  isRemote,
  upstream: null,
  commit: "abc",
  subject: "s",
  author: "a",
  committedAt: "2026-11-10T00:00:00Z",
  ahead: 0,
  behind: 0,
})

const publication = (extra: Partial<BranchPublication> = {}): BranchPublication => ({
  forge: "github",
  branch: "feat/x",
  defaultBranch: "main",
  upstream: "origin/feat/x",
  ahead: 0,
  behind: 0,
  uncommitted: 0,
  pullRequest: null,
  problem: null,
  ...extra,
})

const check = (status: PullRequestCheck["status"]): PullRequestCheck => ({
  name: status,
  status,
  description: null,
  url: null,
  startedAt: null,
  finishedAt: null,
})

describe("commitPaths", () => {
  it("takes a renamed file's old path along", () => {
    expect(
      commitPaths([file("a.ts"), file("new.ts", { kind: "rename", previousPath: "old.ts" })]),
    ).toEqual(["a.ts", "old.ts", "new.ts"])
  })

  it("names a path once when it is both staged as deleted and back on disk", () => {
    expect(
      commitPaths([file("a.ts", { kind: "delete" }), file("a.ts", { kind: "create" })]),
    ).toEqual(["a.ts"])
  })
})

describe("baseBranches", () => {
  it("lists local and origin branches once, default first, without the current one", () => {
    expect(
      baseBranches(
        [
          branch("feat/x"),
          branch("main"),
          branch("develop"),
          branch("origin/HEAD", true),
          branch("origin/main", true),
          branch("origin/release", true),
          branch("upstream/other", true),
        ],
        "feat/x",
        "main",
      ),
    ).toEqual(["main", "develop", "release"])
  })
})

describe("where the branch stands", () => {
  it("needs a push before it is on the remote, and while it is ahead", () => {
    expect(needsPush(publication({ upstream: null }))).toBe(true)
    expect(needsPush(publication({ ahead: 2 }))).toBe(true)
    expect(needsPush(publication())).toBe(false)
    expect(needsPush(publication({ branch: null, upstream: null }))).toBe(false)
  })

  it("says so in one line", () => {
    expect(remoteStatus(publication({ upstream: null }))).toBe("feat/x is not on the remote yet.")
    expect(remoteStatus(publication({ ahead: 1, behind: 2 }))).toBe(
      "1 commit to push, 2 commits behind (origin/feat/x).",
    )
    expect(remoteStatus(publication())).toBe("Up to date with origin/feat/x.")
  })
})

describe("summarizeChecks", () => {
  it("fails on any failure, else stays pending while something runs", () => {
    expect(summarizeChecks([]).overall).toBe("none")
    expect(summarizeChecks([check("success"), check("failure"), check("running")])).toEqual({
      passed: 1,
      failed: 1,
      pending: 1,
      other: 0,
      overall: "failure",
    })
    expect(summarizeChecks([check("success"), check("queued")]).overall).toBe("pending")
    expect(summarizeChecks([check("success"), check("skipped")]).overall).toBe("success")
  })
})

describe("forgeTerms", () => {
  it("names a GitLab merge request as GitLab does", () => {
    expect(forgeTerms("gitlab")).toEqual({ noun: "merge request", site: "GitLab", symbol: "!" })
    expect(forgeTerms("github").symbol).toBe("#")
  })
})
