import { describe, expect, it } from "vitest"
import {
  applyAutonomy,
  DEFAULT_TOOL_POLICY,
  formatOpenedThread,
  OPEN_THREAD_TOOL,
  parseMcpToolName,
  parseThreadHref,
  ProjectId,
  resolveToolMode,
  SessionId,
  setToolRule,
  threadHref,
  type ToolPolicy,
} from "../src/index.ts"

describe("resolveToolMode", () => {
  it("applies the MVP defaults", () => {
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Read")).toBe("auto")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Glob")).toBe("auto")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Grep")).toBe("auto")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Edit")).toBe("review")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Write")).toBe("review")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "NotebookEdit")).toBe("review")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Bash")).toBe("confirm")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "PowerShell")).toBe("confirm")
    // Subagents and anything else the CLI adds later need a human too.
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "Task")).toBe("confirm")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "WebFetch")).toBe("confirm")
  })

  it("never resolves an unknown tool to auto", () => {
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "SomeFutureTool")).toBe("confirm")
    expect(resolveToolMode({ rules: [] }, "Read")).toBe("confirm")
  })

  it("matches every MCP tool through the wildcard", () => {
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "mcp__github__create_issue")).toBe("confirm")
  })

  it("prefers exact rules, then the longest wildcard", () => {
    const policy: ToolPolicy = {
      rules: [
        { pattern: "mcp__*", mode: "confirm" },
        { pattern: "mcp__docs__*", mode: "auto" },
        { pattern: "mcp__docs__delete", mode: "deny" },
      ],
    }
    expect(resolveToolMode(policy, "mcp__docs__search")).toBe("auto")
    expect(resolveToolMode(policy, "mcp__docs__delete")).toBe("deny")
    expect(resolveToolMode(policy, "mcp__other__search")).toBe("confirm")
  })

  it("does not treat a tool name as a prefix without a wildcard", () => {
    const policy: ToolPolicy = { rules: [{ pattern: "Read", mode: "auto" }] }
    expect(resolveToolMode(policy, "ReadSecrets")).toBe("confirm")
  })
})

describe("setToolRule", () => {
  it("replaces an existing rule in place", () => {
    const next = setToolRule(DEFAULT_TOOL_POLICY, "Bash", "auto")
    expect(resolveToolMode(next, "Bash")).toBe("auto")
    expect(next.rules).toHaveLength(DEFAULT_TOOL_POLICY.rules.length)
  })

  it("appends a rule for a tool that had none", () => {
    const next = setToolRule(DEFAULT_TOOL_POLICY, "mcp__github__list_issues", "auto")
    expect(resolveToolMode(next, "mcp__github__list_issues")).toBe("auto")
    expect(resolveToolMode(next, "mcp__github__create_issue")).toBe("confirm")
  })
})

describe("parseMcpToolName", () => {
  it("splits server and tool", () => {
    expect(parseMcpToolName("mcp__github__create_issue")).toEqual({
      server: "github",
      tool: "create_issue",
    })
  })

  it("keeps double underscores inside the tool name", () => {
    expect(parseMcpToolName("mcp__srv__a__b")).toEqual({ server: "srv", tool: "a__b" })
  })

  it("returns undefined for built-in tools", () => {
    expect(parseMcpToolName("Bash")).toBeUndefined()
    expect(parseMcpToolName("mcp__broken")).toBeUndefined()
  })
})

describe("open_thread", () => {
  it("runs without asking by default, unlike other MCP tools, and can be tightened", () => {
    expect(OPEN_THREAD_TOOL).toBe("mcp__humanity__open_thread")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, OPEN_THREAD_TOOL)).toBe("auto")
    expect(resolveToolMode(DEFAULT_TOOL_POLICY, "mcp__humanity__other")).toBe("confirm")
    const tightened = setToolRule(DEFAULT_TOOL_POLICY, OPEN_THREAD_TOOL, "confirm")
    expect(resolveToolMode(tightened, OPEN_THREAD_TOOL)).toBe("confirm")
  })

  const thread = {
    sessionId: SessionId.make("s1"),
    projectId: ProjectId.make("p1"),
    title: "Fix [login]",
    model: "opus",
    effort: "high" as const,
  }

  it("tells the agent what runs and gives it the link to put in its reply", () => {
    expect(formatOpenedThread(thread)).toBe(
      [
        'Opened the thread "Fix [login]" on opus, high effort. It is working now.',
        "When you tell the human about it, link to it inline in your sentence, with exactly this markdown: [Fix \\[login\\]](/projects/p1/sessions/s1)",
        "Humanity shows that link as the project's icon and the thread's title, so add no id, path or separate link.",
      ].join("\n"),
    )
    expect(formatOpenedThread({ ...thread, model: null, effort: null })).toContain(
      "on the default model. It",
    )
  })

  it("recognises a link to a thread, and no other link", () => {
    const target = { projectId: "p1", sessionId: "s1" }
    expect(parseThreadHref(threadHref("p1", "s1"))).toEqual(target)
    expect(parseThreadHref("http://127.0.0.1:7420/projects/p1/sessions/s1/")).toEqual(target)
    expect(parseThreadHref(threadHref("a b", "c/d"))).toEqual({
      projectId: "a b",
      sessionId: "c/d",
    })
    expect(parseThreadHref("/projects/p1")).toBeUndefined()
    expect(parseThreadHref("/projects/p1/sessions/s1/extra")).toBeUndefined()
    expect(parseThreadHref("https://example.com/docs")).toBeUndefined()
    expect(parseThreadHref("/projects/%E0%A4%A/sessions/s1")).toBeUndefined()
  })
})

describe("applyAutonomy", () => {
  const modes = ["auto", "review", "confirm", "deny"] as const

  it("ask leaves the project's mode as it is", () => {
    for (const mode of modes) expect(applyAutonomy("ask", mode)).toBe(mode)
  })

  it("accept_edits lets reviewed tools through and nothing else", () => {
    expect(modes.map((mode) => applyAutonomy("accept_edits", mode))).toEqual([
      "auto",
      "auto",
      "confirm",
      "deny",
    ])
  })

  it("auto lets everything through except denied tools", () => {
    expect(modes.map((mode) => applyAutonomy("auto", mode))).toEqual([
      "auto",
      "auto",
      "auto",
      "deny",
    ])
  })
})
