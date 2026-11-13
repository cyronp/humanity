import {
  type GitLabConnection,
  type GitLabRepo,
  normalizeGitLabHost,
  type Project,
  ProjectId,
} from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  addableGitLabRepos,
  parseGitLabInput,
  repoNeedle,
  typedChoice,
} from "@/features/github/repoInput"
import {
  installGlabCommand,
  isGitLabConnected,
  newGitLabTokenUrl,
  summarizeGitLab,
} from "@/features/gitlab/connection"

const repo = (fullPath: string): GitLabRepo => ({
  fullPath,
  name: fullPath.split("/").at(-1) ?? fullPath,
  description: null,
  private: false,
  cloneUrl: `https://gitlab.com/${fullPath}.git`,
  webUrl: `https://gitlab.com/${fullPath}`,
  updatedAt: "2026-11-01T00:00:00Z",
})

const project = (name: string, gitlab: Project["gitlab"]): Project => ({
  id: ProjectId.make(name),
  name,
  localPath: `/repos/${name}`,
  githubFullName: null,
  gitlab,
  defaultBranch: "main",
  defaultAutonomy: null,
  createdAt: "2026-11-01T00:00:00Z",
})

describe("normalizeGitLabHost", () => {
  it("reads a host out of what a human pastes", () => {
    expect(normalizeGitLabHost("gitlab.com")).toBe("gitlab.com")
    expect(normalizeGitLabHost("  https://GitLab.Example.com/ ")).toBe("gitlab.example.com")
    expect(normalizeGitLabHost("git.acme.dev:8443")).toBe("git.acme.dev:8443")
  })

  it("rejects anything that is more than a host", () => {
    expect(normalizeGitLabHost("")).toBeUndefined()
    expect(normalizeGitLabHost("gitlab.com/acme")).toBeUndefined()
    expect(normalizeGitLabHost("user@gitlab.com")).toBeUndefined()
    expect(normalizeGitLabHost("gitlab.com?x=1")).toBeUndefined()
    expect(normalizeGitLabHost("git lab.com")).toBeUndefined()
  })
})

describe("parseGitLabInput", () => {
  it("accepts URLs of the connected instance, subgroups included", () => {
    expect(parseGitLabInput("https://gitlab.com/acme/widgets", "gitlab.com")).toBe("acme/widgets")
    expect(parseGitLabInput(" https://gitlab.com/acme/tools/widgets.git ", "gitlab.com")).toBe(
      "acme/tools/widgets",
    )
    expect(parseGitLabInput("gitlab.com/acme/widgets/", "gitlab.com")).toBe("acme/widgets")
    expect(parseGitLabInput("git@gitlab.com:acme/widgets.git", "gitlab.com")).toBe("acme/widgets")
    expect(parseGitLabInput("https://git.acme.dev:8443/acme/widgets", "git.acme.dev:8443")).toBe(
      "acme/widgets",
    )
  })

  it("rejects other hosts, bare names and anything that is not a repository", () => {
    expect(parseGitLabInput("https://github.com/acme/widgets", "gitlab.com")).toBeUndefined()
    expect(parseGitLabInput("https://gitlab.com/acme/widgets", "git.acme.dev")).toBeUndefined()
    expect(parseGitLabInput("acme/widgets", "gitlab.com")).toBeUndefined()
    expect(parseGitLabInput("https://gitlab.com/acme", "gitlab.com")).toBeUndefined()
    expect(parseGitLabInput("https://gitlab.com/acme/../etc", "gitlab.com")).toBeUndefined()
    expect(parseGitLabInput("", "gitlab.com")).toBeUndefined()
  })
})

describe("the add-repository list with GitLab", () => {
  const repos = [repo("acme/widgets"), repo("acme/tools/gadgets")]
  const projects = [
    project("widgets", { host: "gitlab.com", fullPath: "Acme/Widgets" }),
    project("elsewhere", { host: "git.acme.dev", fullPath: "acme/tools/gadgets" }),
  ]
  const gitlab = { host: "gitlab.com", repos }

  it("searches by the repository a pasted URL names", () => {
    expect(repoNeedle("https://gitlab.com/Acme/Tools/Gadgets.git", "gitlab.com")).toBe(
      "acme/tools/gadgets",
    )
    expect(repoNeedle("https://gitlab.com/acme/widgets")).toBe("https://gitlab.com/acme/widgets")
  })

  it("leaves out the repositories of this instance that already are projects", () => {
    expect(addableGitLabRepos(repos, projects, "gitlab.com").map((r) => r.fullPath)).toEqual([
      "acme/tools/gadgets",
    ])
    expect(addableGitLabRepos(repos, [], "gitlab.com")).toEqual(repos)
  })

  it("offers to clone a repository named by its URL that the list lacks", () => {
    expect(typedChoice("https://gitlab.com/other/thing", [], projects, gitlab)).toEqual({
      kind: "cloneGitLab",
      fullPath: "other/thing",
    })
    // Listed already: the row itself is the way to add it.
    expect(
      typedChoice("https://gitlab.com/acme/tools/gadgets", [], projects, gitlab),
    ).toBeUndefined()
    expect(typedChoice("https://gitlab.com/acme/widgets", [], projects, gitlab)).toEqual({
      kind: "added",
      project: projects[0],
    })
  })

  it("keeps a bare owner/repo for GitHub", () => {
    expect(typedChoice("other/thing", [], projects, gitlab)).toEqual({
      kind: "clone",
      fullName: "other/thing",
    })
  })
})

describe("summarizeGitLab", () => {
  const connection = (overrides: Partial<GitLabConnection>): GitLabConnection => ({
    host: "gitlab.com",
    source: "cli",
    cliInstalled: true,
    user: { username: "tanuki", name: null, avatarUrl: null },
    problem: null,
    ...overrides,
  })

  it("says who is connected, through what, and on which instance when it is not gitlab.com", () => {
    expect(summarizeGitLab(connection({}))).toEqual({
      tone: "ok",
      title: "Connected as tanuki through the GitLab CLI",
    })
    expect(summarizeGitLab(connection({ source: "token", host: "git.acme.dev" })).title).toBe(
      "Connected as tanuki on git.acme.dev through a saved token",
    )
    expect(isGitLabConnected(connection({}))).toBe(true)
  })

  it("tells no login from one GitLab refuses", () => {
    const none = connection({ source: null, user: null })
    expect(summarizeGitLab(none)).toEqual({ tone: "warning", title: "Not connected" })
    expect(isGitLabConnected(none)).toBe(false)

    const refused = connection({ source: "environment", user: null, problem: "rejected" })
    expect(summarizeGitLab(refused)).toEqual({
      tone: "error",
      title: "The login from GITLAB_TOKEN is not working",
    })
    expect(isGitLabConnected(refused)).toBe(false)
  })
})

describe("GitLab CLI and token help", () => {
  it("knows the one-line install on Windows and macOS only", () => {
    expect(installGlabCommand("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "winget install glab.glab",
    )
    expect(installGlabCommand("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "brew install glab",
    )
    expect(installGlabCommand("Mozilla/5.0 (X11; Linux x86_64)")).toBeNull()
  })

  it("points at the token page of the chosen instance", () => {
    expect(newGitLabTokenUrl("git.acme.dev")).toBe(
      "https://git.acme.dev/-/user_settings/personal_access_tokens",
    )
  })
})
