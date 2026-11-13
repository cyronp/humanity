import { describe, expect, it } from "vitest"
import {
  applyAutonomy,
  AUTO_TOOLS,
  DEFAULT_AUTONOMY,
  formatOpenedThread,
  OPEN_THREAD_TOOL,
  parseMcpToolName,
  parseThreadHref,
  ProjectId,
  SessionId,
  threadHref,
  toolMode,
} from "../src/index.ts"

describe("toolMode", () => {
  it("lets reads and the agent's own bookkeeping run in every thread", () => {
    for (const tool of ["Read", "Glob", "Grep", "TodoWrite", "Skill"]) {
      expect(toolMode(tool)).toBe("auto")
    }
    expect(AUTO_TOOLS).toContain("Read")
  })

  it("treats file-mutating built-ins as file changes", () => {
    expect(toolMode("Edit")).toBe("review")
    expect(toolMode("Write")).toBe("review")
    expect(toolMode("NotebookEdit")).toBe("review")
  })

  it("treats everything else as a call to allow or deny", () => {
    expect(toolMode("Bash")).toBe("confirm")
    expect(toolMode("PowerShell")).toBe("confirm")
    // Subagents and anything else the CLI adds later.
    expect(toolMode("Task")).toBe("confirm")
    expect(toolMode("WebFetch")).toBe("confirm")
    expect(toolMode("mcp__github__create_issue")).toBe("confirm")
  })

  it("never takes an unknown tool, or a longer name, for one that runs by itself", () => {
    expect(toolMode("SomeFutureTool")).toBe("confirm")
    expect(toolMode("ReadSecrets")).toBe("confirm")
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
  it("runs without asking in every thread, unlike other MCP tools", () => {
    expect(OPEN_THREAD_TOOL).toBe("mcp__humanity__open_thread")
    expect(toolMode(OPEN_THREAD_TOOL)).toBe("auto")
    expect(toolMode("mcp__humanity__other")).toBe("confirm")
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
  const modes = ["auto", "review", "confirm"] as const

  it("ask leaves the tool's mode as it is", () => {
    for (const mode of modes) expect(applyAutonomy("ask", mode)).toBe(mode)
  })

  it("accept_edits lets file changes through and nothing else", () => {
    expect(modes.map((mode) => applyAutonomy("accept_edits", mode))).toEqual([
      "auto",
      "auto",
      "confirm",
    ])
  })

  it("auto lets everything through", () => {
    expect(modes.map((mode) => applyAutonomy("auto", mode))).toEqual(["auto", "auto", "auto"])
  })

  it("is what a thread starts with unless a default says otherwise", () => {
    expect(DEFAULT_AUTONOMY).toBe("auto")
  })
})
