import { describe, expect, it } from "vitest"
import { parseGitHubFullName } from "../src/services/GitService.ts"
import { FIELD, parseBranches, parseStatus, parseWorktrees } from "../src/services/gitParsers.ts"

describe("parseStatus", () => {
  it("reads branch headers including upstream and ahead/behind", () => {
    const output = [
      "# branch.oid 1234567890abcdef",
      "# branch.head feature/x",
      "# branch.upstream origin/feature/x",
      "# branch.ab +3 -1",
      "",
    ].join("\0")
    expect(parseStatus(output)).toEqual({
      branch: "feature/x",
      upstream: "origin/feature/x",
      ahead: 3,
      behind: 1,
      entries: [],
    })
  })

  it("reports a detached HEAD as no branch", () => {
    expect(parseStatus("# branch.oid abc\0# branch.head (detached)\0").branch).toBeNull()
  })

  it("keeps spaces in paths and pairs a rename with its original path", () => {
    const output = [
      "# branch.head main",
      "1 .M N... 100644 100644 100644 aaa bbb src/with space.ts",
      "2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts",
      "old name.ts",
      "1 A. N... 000000 100644 100644 000 bbb added.ts",
      "u UU N... 100644 100644 100644 100644 aaa bbb ccc conflicted file.ts",
      "? untracked dir/file.ts",
      "",
    ].join("\0")

    expect(parseStatus(output).entries).toEqual([
      { path: "src/with space.ts", kind: "modified", staged: false, unstaged: true },
      {
        path: "new name.ts",
        previousPath: "old name.ts",
        kind: "renamed",
        staged: true,
        unstaged: false,
      },
      { path: "added.ts", kind: "added", staged: true, unstaged: false },
      { path: "conflicted file.ts", kind: "conflicted", staged: false, unstaged: true },
      { path: "untracked dir/file.ts", kind: "untracked", staged: false, unstaged: true },
    ])
  })
})

describe("parseBranches", () => {
  const row = (...fields: Array<string>) => fields.join(FIELD)

  it("separates local from remote branches and skips the remote HEAD pointer", () => {
    const output = [
      row("refs/heads/main", "main", "*", "origin/main", "abc1234", "initial commit"),
      row("refs/heads/topic", "topic", " ", "", "def5678", "wip: a | b"),
      row("refs/remotes/origin/HEAD", "origin", " ", "", "abc1234", "initial commit"),
      row("refs/remotes/origin/main", "origin/main", " ", "", "abc1234", "initial commit"),
      "",
    ].join("\n")

    expect(parseBranches(output)).toEqual([
      {
        name: "main",
        isCurrent: true,
        isRemote: false,
        upstream: "origin/main",
        commit: "abc1234",
        subject: "initial commit",
      },
      {
        name: "topic",
        isCurrent: false,
        isRemote: false,
        upstream: null,
        commit: "def5678",
        subject: "wip: a | b",
      },
      {
        name: "origin/main",
        isCurrent: false,
        isRemote: true,
        upstream: null,
        commit: "abc1234",
        subject: "initial commit",
      },
    ])
  })
})

describe("parseWorktrees", () => {
  it("parses attribute blocks, including a detached worktree", () => {
    const output = [
      "worktree C:/code/repo",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree C:/Users/me/.humanity/worktrees/p/s",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/humanity/abc-fix",
      "",
      "worktree C:/tmp/detached",
      "HEAD 3333333333333333333333333333333333333333",
      "detached",
      "",
    ].join("\n")

    expect(parseWorktrees(output)).toEqual([
      { path: "C:/code/repo", head: "1".repeat(40), branch: "main" },
      {
        path: "C:/Users/me/.humanity/worktrees/p/s",
        head: "2".repeat(40),
        branch: "humanity/abc-fix",
      },
      { path: "C:/tmp/detached", head: "3".repeat(40), branch: undefined },
    ])
  })
})

describe("parseGitHubFullName", () => {
  it("understands https and ssh remotes", () => {
    expect(parseGitHubFullName("https://github.com/acme/widgets.git")).toBe("acme/widgets")
    expect(parseGitHubFullName("https://github.com/acme/widgets")).toBe("acme/widgets")
    expect(parseGitHubFullName("git@github.com:acme/widgets.git")).toBe("acme/widgets")
    expect(parseGitHubFullName("ssh://git@github.com/acme/my.repo.git")).toBe("acme/my.repo")
  })

  it("ignores other hosts and missing remotes", () => {
    expect(parseGitHubFullName("https://gitlab.com/acme/widgets.git")).toBeUndefined()
    expect(parseGitHubFullName(undefined)).toBeUndefined()
  })
})
