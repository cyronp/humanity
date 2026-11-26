import {
  type Branch,
  type BranchPublication,
  type FileDiff,
  type PullRequest,
  type PullRequestCheck,
  type PullRequestFeed,
  forgeTerms,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  baseBranches,
  commitPaths,
  checksPhrase,
  feedNotice,
  footerNote,
  checkoutMoved,
  mergeOptions,
  needsPush,
  primaryAction,
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
  checkedOut: "feat/x",
  defaultBranch: "main",
  upstream: "origin/feat/x",
  ahead: 0,
  behind: 0,
  uncommitted: 0,
  ...extra,
})

const feed = (extra: Partial<PullRequestFeed> = {}): PullRequestFeed => ({
  pullRequest: null,
  checks: [],
  comments: [],
  fetchedAt: "2026-11-13T10:00:00Z",
  problem: null,
  pausedUntil: null,
  needsToken: false,
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

  it("tells when the shared checkout moved to another branch", () => {
    expect(checkoutMoved(publication())).toBe(false)
    expect(checkoutMoved(publication({ checkedOut: "main" }))).toBe(true)
    expect(checkoutMoved(publication({ checkedOut: null }))).toBe(true)
    expect(checkoutMoved(publication({ branch: null, checkedOut: "main" }))).toBe(false)
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

describe("feedNotice", () => {
  it("says nothing while the forge answers as usual", () => {
    expect(feedNotice(feed(), "github")).toBeNull()
  })

  it("explains a rate limit as a pause, not as a failure", () => {
    const notice = feedNotice(
      feed({ pausedUntil: "2026-11-13T11:50:03Z", problem: "rate limit" }),
      "github",
    )
    expect(notice?.tone).toBe("note")
    expect(notice?.title).toMatch(/^Paused until /)
    expect(notice?.message).toContain("GitHub's rate limit was reached. Showing what it said at")
  })

  it("reports a forge that failed, and asks for a token when there is none", () => {
    expect(feedNotice(feed({ problem: "boom" }), "gitlab")).toEqual({
      tone: "error",
      title: "Could not reach GitLab",
      message: "boom",
    })
    const notice = feedNotice(feed({ needsToken: true, fetchedAt: null }), "github")
    expect(notice?.tone).toBe("note")
    expect(notice?.title).toBe("No GitHub token connected")
    expect(notice?.message).toContain("only when you press Refresh")
  })
})

const pull = (state: PullRequest["state"]): PullRequest => ({
  forge: "github",
  number: 7,
  title: "Add login",
  body: "",
  url: "https://github.com/acme/app/pull/7",
  state,
  base: "main",
  head: "feat/x",
  headSha: "abc",
  author: "octocat",
  createdAt: "2026-11-10T00:00:00Z",
})

describe("primaryAction", () => {
  const kind = (...args: Parameters<typeof primaryAction>) => primaryAction(...args)?.kind ?? null

  it("commits first, whatever the pull request says", () => {
    expect(primaryAction({ publication: publication(), changed: 2, feed: feed() })).toEqual({
      kind: "commit",
      files: 2,
    })
    expect(
      kind({ publication: publication(), changed: 1, feed: feed({ pullRequest: pull("open") }) }),
    ).toBe("commit")
  })

  it("pushes to an open pull request, then marks a draft ready or merges", () => {
    const live = (state: PullRequest["state"]) => feed({ pullRequest: pull(state) })
    expect(kind({ publication: publication({ ahead: 1 }), changed: 0, feed: live("open") })).toBe(
      "push",
    )
    expect(kind({ publication: publication(), changed: 0, feed: live("draft") })).toBe("ready")
    expect(kind({ publication: publication(), changed: 0, feed: live("open") })).toBe("merge")
  })

  it("opens a pull request once the forge said there is none, or only a closed one", () => {
    expect(kind({ publication: publication({ upstream: null }), changed: 0, feed: feed() })).toBe(
      "open-pull-request",
    )
    expect(
      kind({ publication: publication(), changed: 0, feed: feed({ pullRequest: pull("closed") }) }),
    ).toBe("open-pull-request")
    expect(
      kind({ publication: publication({ upstream: null }), changed: 0, feed: undefined }),
    ).toBe("push")
    expect(
      kind({
        publication: publication({ upstream: null }),
        changed: 0,
        feed: feed({ fetchedAt: null }),
      }),
    ).toBe("push")
  })

  it("offers nothing to open on the default branch, without a forge, or after a merge", () => {
    const onMain = publication({ branch: "main", checkedOut: "main", upstream: "origin/main" })
    expect(kind({ publication: onMain, changed: 0, feed: feed() })).toBe(null)
    expect(kind({ publication: publication({ forge: null }), changed: 0, feed: feed() })).toBe(null)
    expect(
      kind({ publication: publication(), changed: 0, feed: feed({ pullRequest: pull("merged") }) }),
    ).toBe(null)
    expect(
      kind({
        publication: publication({ ahead: 2 }),
        changed: 0,
        feed: feed({ pullRequest: pull("merged") }),
      }),
    ).toBe("push")
  })

  it("offers nothing while the checkout is on another branch", () => {
    const moved = publication({ checkedOut: "main" })
    expect(kind({ publication: moved, changed: 3, feed: feed() })).toBe(null)
  })
})

describe("mergeOptions", () => {
  it("offers GitHub's three methods, and GitLab's merge with or without a squash", () => {
    expect(mergeOptions("github").map((option) => option.method)).toEqual([
      "squash",
      "merge",
      "rebase",
    ])
    expect(mergeOptions("gitlab").map((option) => option.method)).toEqual(["merge", "squash"])
  })
})

describe("checksPhrase", () => {
  it("says how the checks stand, worst first", () => {
    expect(checksPhrase([])).toBe("No checks reported yet")
    expect(
      checksPhrase([check("success"), check("failure"), check("running"), check("skipped")]),
    ).toBe("1 failing · 1 in progress · 1 passed · 1 skipped")
  })
})

describe("footerNote", () => {
  const note = (...args: Parameters<typeof footerNote>) => footerNote(...args)

  it("counts what a commit takes, and what waits to be pushed", () => {
    const commit = { kind: "commit", files: 3 } as const
    expect(
      note({ action: commit, publication: publication({ ahead: 1 }), changed: 3, feed: feed() }),
    ).toEqual({ text: "3 files changed · 1 commit to push", tone: "muted" })
    expect(
      note({
        action: commit,
        publication: publication({ upstream: null }),
        changed: 1,
        feed: feed(),
      })?.text,
    ).toBe("1 file changed")
  })

  it("names the failing checks before a merge, in red", () => {
    const failing = { ...check("failure"), name: "test" }
    expect(
      note({
        action: { kind: "merge" },
        publication: publication(),
        changed: 0,
        feed: feed({ pullRequest: pull("open"), checks: [check("success"), failing] }),
      }),
    ).toEqual({ text: "1 check failing: test", tone: "destructive" })
    expect(
      note({
        action: { kind: "merge" },
        publication: publication(),
        changed: 0,
        feed: feed({ pullRequest: pull("open"), checks: [check("success")] }),
      })?.text,
    ).toBe("Every check passed")
  })

  it("says where the branch stands when nothing is left to do", () => {
    expect(
      note({
        action: null,
        publication: publication(),
        changed: 0,
        feed: feed({ pullRequest: pull("merged") }),
      })?.text,
    ).toBe("Merged into main")
    expect(
      note({
        action: null,
        publication: publication({ checkedOut: "main" }),
        changed: 0,
        feed: feed(),
      }),
    ).toBeNull()
  })
})
