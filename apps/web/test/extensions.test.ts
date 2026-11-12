import type { McpServer } from "@humanity/contracts"
import { describe, expect, it } from "vitest"
import {
  blankEntry,
  buildMcpInput,
  checkSkill,
  draftFromServer,
  EMPTY_DRAFT,
  skillSlug,
} from "@/features/extensions/mcpForm"
import {
  applyInsertion,
  insertAtSelection,
  insertSkill,
  menuScore,
} from "@/features/extensions/prompt"

describe("inserting into the message box", () => {
  it("puts a skill first, where Claude Code runs slash commands", () => {
    expect(insertSkill("", "/humanity:review-sql")).toEqual({
      text: "/humanity:review-sql ",
      caret: 21,
    })
    expect(insertSkill("  check the migrations", "/deploy")).toEqual({
      text: "/deploy check the migrations",
      caret: 28,
    })
  })

  it("does not repeat the skill the message already starts with", () => {
    expect(insertSkill("/deploy now", "/deploy")).toEqual({ text: "/deploy now", caret: 11 })
    expect(insertSkill("/deploy", "/deploy").text).toBe("/deploy")
    // Another command that merely starts the same way is a different skill.
    expect(insertSkill("/deployment x", "/deploy").text).toBe("/deploy /deployment x")
  })

  it("ranks the menu by name before description, without fuzzy matches", () => {
    expect(menuScore("docs", [], "")).toBe(1)
    expect(menuScore("docs", [], "do")).toBe(1)
    expect(menuScore("my-docs", [], "docs")).toBe(0.8)
    expect(menuScore("search", ["Searches the docs"], "docs")).toBe(0.4)
    expect(menuScore("deploy", ["Ships the app. Use to deploy."], "docs")).toBe(0)
  })

  it("puts an MCP server at the caret, set apart by spaces", () => {
    expect(insertAtSelection("use to find it", "mcp__docs", 4, 4)).toEqual({
      text: "use mcp__docs to find it",
      caret: 14,
    })
    expect(insertAtSelection("ask", "mcp__docs", 3, 3)).toEqual({
      text: "ask mcp__docs ",
      caret: 14,
    })
    // A selection is replaced.
    expect(insertAtSelection("use X now", "mcp__docs", 4, 5).text).toBe("use mcp__docs now")
    // A caret past the end (a stale selection) is clamped.
    expect(insertAtSelection("", "mcp__docs", 9, 9)).toEqual({ text: "mcp__docs ", caret: 10 })
  })

  it("picks the rule by what was chosen", () => {
    const selection = { start: 0, end: 0 }
    expect(applyInsertion("hi", { kind: "skill", invocation: "/x" }, selection).text).toBe("/x hi")
    expect(applyInsertion("hi", { kind: "mcp", server: "gh" }, selection).text).toBe("mcp__gh hi")
  })
})

describe("the MCP server form", () => {
  it("builds a local server, one argument per line", () => {
    const result = buildMcpInput({
      ...EMPTY_DRAFT,
      name: " fs ",
      command: " npx ",
      args: "-y\n\n  @mcp/server-fs  \nC:\\My Folder\n",
      env: [
        { ...blankEntry(), name: "TOKEN", value: "abc" },
        // Left entirely blank: ignored.
        blankEntry(),
      ],
    })
    expect(result).toEqual({
      ok: {
        name: "fs",
        transport: {
          _tag: "stdio",
          command: "npx",
          args: ["-y", "@mcp/server-fs", "C:\\My Folder"],
          env: [{ name: "TOKEN", value: "abc" }],
        },
      },
    })
  })

  it("keeps saved values left empty, and asks for new ones", () => {
    const server: McpServer = {
      name: "gh",
      source: "humanity",
      enabled: true,
      transport: { _tag: "http", url: "https://api.dev/mcp", headers: ["Authorization"] },
    }
    const draft = draftFromServer(server)
    expect(draft.headers.map((entry) => [entry.name, entry.value, entry.saved])).toEqual([
      ["Authorization", "", true],
    ])
    expect(buildMcpInput(draft)).toEqual({
      ok: {
        name: "gh",
        transport: {
          _tag: "http",
          url: "https://api.dev/mcp",
          headers: [{ name: "Authorization", value: null }],
        },
      },
    })
    const unsaved = { ...draft, headers: [{ ...blankEntry(), name: "X-Key" }] }
    expect(buildMcpInput(unsaved)).toEqual({ error: "Enter a value for the header X-Key." })
  })

  it("says what to fix", () => {
    expect(buildMcpInput(EMPTY_DRAFT)).toEqual({ error: "Give the server a name." })
    expect(buildMcpInput({ ...EMPTY_DRAFT, name: "has space", command: "x" })).toHaveProperty(
      "error",
    )
    expect(buildMcpInput({ ...EMPTY_DRAFT, name: "a" })).toHaveProperty("error")
    expect(
      buildMcpInput({ ...EMPTY_DRAFT, name: "a", transport: "http", url: "ftp://x" }),
    ).toHaveProperty("error")
    expect(
      buildMcpInput({
        ...EMPTY_DRAFT,
        name: "a",
        command: "x",
        env: [
          { ...blankEntry(), name: "A", value: "1" },
          { ...blankEntry(), name: "A", value: "2" },
        ],
      }),
    ).toEqual({ error: "The environment variable A is listed twice." })
  })
})

describe("the skill form", () => {
  it("shapes names the way skills need them", () => {
    expect(skillSlug("Review SQL!")).toBe("review-sql")
    expect(skillSlug("  Déploiement — prod ")).toBe("deploiement-prod")
    expect(skillSlug("a".repeat(70))).toHaveLength(64)
  })

  it("needs a name, a description and instructions", () => {
    expect(checkSkill({ name: "Review SQL", description: "x", instructions: "y" })).toHaveProperty(
      "error",
    )
    expect(checkSkill({ name: "review-sql", description: " ", instructions: "y" })).toHaveProperty(
      "error",
    )
    expect(checkSkill({ name: "review-sql", description: "x", instructions: "  " })).toHaveProperty(
      "error",
    )
    expect(
      checkSkill({ name: "review-sql", description: "Reviews\n SQL", instructions: "Do it" }),
    ).toEqual({ ok: { name: "review-sql", description: "Reviews SQL", instructions: "Do it" } })
  })
})
