import { describe, expect, it } from "vitest"
import {
  applyAutonomy,
  DEFAULT_TOOL_POLICY,
  parseMcpToolName,
  resolveToolMode,
  setToolRule,
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
