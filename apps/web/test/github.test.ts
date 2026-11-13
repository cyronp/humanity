import {
  type GitHubConnection,
  type GitHubRepo,
  type Project,
  ProjectId,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import { installCliCommand, isConnected, summarizeGitHub } from "@/features/github/connection"
import {
  addableRepos,
  parseLocalPath,
  parseRepoInput,
  repoNeedle,
  typedChoice,
} from "@/features/github/repoInput"

const repo = (fullName: string): GitHubRepo => ({
  fullName,
  name: fullName.split("/")[1] ?? fullName,
  owner: fullName.split("/")[0] ?? "",
  description: null,
  private: false,
  defaultBranch: "main",
  cloneUrl: `https://github.com/${fullName}.git`,
  htmlUrl: `https://github.com/${fullName}`,
  updatedAt: "2026-11-01T00:00:00Z",
})

const project = (name: string, githubFullName: string | null): Project => ({
  id: ProjectId.make(name),
  name,
  localPath: `/repos/${name}`,
  githubFullName,
  defaultBranch: "main",
  defaultAutonomy: null,
  createdAt: "2026-11-01T00:00:00Z",
})

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

describe("parseLocalPath", () => {
  it("accepts absolute Windows and POSIX paths", () => {
    expect(parseLocalPath(" C:\\code\\app ")).toBe("C:\\code\\app")
    expect(parseLocalPath("c:/code/app")).toBe("c:/code/app")
    expect(parseLocalPath("\\\\server\\share\\app")).toBe("\\\\server\\share\\app")
    expect(parseLocalPath("/home/me/app")).toBe("/home/me/app")
  })

  it("rejects relative paths, repository names and bare roots", () => {
    expect(parseLocalPath("code/app")).toBeUndefined()
    expect(parseLocalPath("acme/widgets")).toBeUndefined()
    expect(parseLocalPath("https://github.com/acme/widgets")).toBeUndefined()
    expect(parseLocalPath("/")).toBeUndefined()
    expect(parseLocalPath("")).toBeUndefined()
  })
})

describe("the add-repository list", () => {
  const repos = [repo("acme/widgets"), repo("acme/gadgets")]
  const projects = [project("widgets", "Acme/Widgets"), project("local-only", null)]

  it("searches by the repository a pasted URL names", () => {
    expect(repoNeedle("  https://github.com/Acme/Widgets.git ")).toBe("acme/widgets")
    expect(repoNeedle(" Gadg ")).toBe("gadg")
  })

  it("leaves out the repositories that already are projects", () => {
    expect(addableRepos(repos, projects).map((r) => r.fullName)).toEqual(["acme/gadgets"])
    expect(addableRepos(repos, [])).toEqual(repos)
  })

  it("offers to clone a named repository the list lacks", () => {
    expect(typedChoice("other/thing", repos, projects)).toEqual({
      kind: "clone",
      fullName: "other/thing",
    })
    // Listed already: the row itself is the way to add it.
    expect(typedChoice("https://github.com/acme/gadgets", repos, projects)).toBeUndefined()
  })

  it("offers to add a folder, and to open a repository that is already a project", () => {
    expect(typedChoice("/home/me/app", repos, projects)).toEqual({
      kind: "local",
      path: "/home/me/app",
    })
    expect(typedChoice("acme/widgets", repos, projects)).toEqual({
      kind: "added",
      project: projects[0],
    })
  })

  it("offers nothing for plain search text", () => {
    expect(typedChoice("widg", repos, projects)).toBeUndefined()
    expect(typedChoice("", repos, projects)).toBeUndefined()
  })
})

describe("summarizeGitHub", () => {
  const connection = (overrides: Partial<GitHubConnection>): GitHubConnection => ({
    source: "cli",
    cliInstalled: true,
    user: { login: "octo", name: null, avatarUrl: "https://x/a.png" },
    problem: null,
    ...overrides,
  })

  it("says who is connected and through what", () => {
    expect(summarizeGitHub(connection({}))).toEqual({
      tone: "ok",
      title: "Connected as octo through the GitHub CLI",
    })
    expect(summarizeGitHub(connection({ source: "token" })).title).toBe(
      "Connected as octo through a saved token",
    )
    expect(isConnected(connection({}))).toBe(true)
  })

  it("tells no login from one GitHub refuses", () => {
    const none = connection({ source: null, user: null })
    expect(summarizeGitHub(none)).toEqual({ tone: "warning", title: "Not connected" })
    expect(isConnected(none)).toBe(false)

    const refused = connection({ source: "environment", user: null, problem: "rejected" })
    expect(summarizeGitHub(refused)).toEqual({
      tone: "error",
      title: "The login from GITHUB_TOKEN is not working",
    })
    expect(isConnected(refused)).toBe(false)
  })
})

describe("installCliCommand", () => {
  it("knows the one-line install on Windows and macOS only", () => {
    expect(installCliCommand("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "winget install --id GitHub.cli",
    )
    expect(installCliCommand("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "brew install gh",
    )
    expect(installCliCommand("Mozilla/5.0 (X11; Linux x86_64)")).toBeNull()
  })
})
