import { describe, expect, it } from "vitest"
import {
  applyAutonomy,
  AUTO_TOOLS,
  DEFAULT_AUTONOMY,
  formatOpenedThread,
  isTerminalToolName,
  OPEN_THREAD_TOOL,
  openedThreadIn,
  TERMINAL_TOOLS,
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

  it("treats a Codex patch as a file change and a Codex command as any shell command", () => {
    expect(toolMode("ApplyPatch")).toBe("review")
    expect(applyAutonomy("accept_edits", toolMode("ApplyPatch"))).toBe("auto")
    expect(toolMode("Bash")).toBe("confirm")
    expect(toolMode("McpRequest")).toBe("confirm")
  })

  it("treats everything else as a call to allow or deny", () => {
    expect(toolMode("Bash")).toBe("confirm")
    expect(toolMode("PowerShell")).toBe("confirm")
    expect(toolMode("Task")).toBe("confirm")
    expect(toolMode("WebFetch")).toBe("confirm")
    expect(toolMode("mcp__github__create_issue")).toBe("confirm")
  })

  it("passes the terminal tools through to Humanity, which decides what they type", () => {
    expect(TERMINAL_TOOLS).toEqual([
      "mcp__humanity__terminal_list",
      "mcp__humanity__terminal_read",
      "mcp__humanity__terminal_send",
      "mcp__humanity__terminal_wait",
      "mcp__humanity__terminal_open",
      "mcp__humanity__terminal_close",
    ])
    for (const tool of TERMINAL_TOOLS) expect(toolMode(tool)).toBe("auto")
    expect(isTerminalToolName("terminal_send")).toBe(true)
    expect(isTerminalToolName("open_thread")).toBe(false)
    expect(toolMode("mcp__other__terminal_send")).toBe("confirm")
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
    provider: "claude-code" as const,
    model: "opus",
    effort: "high" as const,
  }

  it("tells the agent what runs and gives it the link to put in its reply", () => {
    expect(formatOpenedThread(thread)).toBe(
      [
        'Opened the thread "Fix [login]" on Claude Code, opus, high effort. It is working now.',
        "When you tell the human about it, link to it inline in your sentence, with exactly this markdown: [Fix \\[login\\]](/projects/p1/sessions/s1)",
        "Humanity shows that link as the project's icon and the thread's title, so add no id, path or separate link.",
        'To wait for it to finish, or to read what it did, call thread_result with thread_id "s1".',
      ].join("\n"),
    )
    expect(
      formatOpenedThread({ ...thread, provider: "kiro", model: null, effort: null }),
    ).toContain("on Kiro, the default model. It")
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

  it("finds the opened thread in open_thread's result", () => {
    const text = formatOpenedThread({
      sessionId: SessionId.make("s 1"),
      projectId: ProjectId.make("p1"),
      title: "Fix [it]",
      provider: "codex",
      model: null,
      effort: null,
    })
    expect(openedThreadIn(text)).toEqual({ projectId: "p1", sessionId: "s 1" })
    expect(openedThreadIn("No thread was opened: the prompt is empty.")).toBeUndefined()
  })

  it("reads a thread link the way the markdown regex did, and no further", () => {
    expect(
      openedThreadIn("see [a](/projects/p1/sessions/s1) and [b](/projects/p2/sessions/s2)"),
    ).toEqual({ projectId: "p1", sessionId: "s1" })
    expect(openedThreadIn("[a](/projects/ x) then [b](/projects/p2/sessions/s2)")).toEqual({
      projectId: "p2",
      sessionId: "s2",
    })
    expect(openedThreadIn("[a](/projects/)")).toBeUndefined()
    expect(openedThreadIn("[a](/projects/) [b](/projects/p3/sessions/s3)")).toEqual({
      projectId: "p3",
      sessionId: "s3",
    })
    expect(openedThreadIn("[a](/projects/p1/sessions/s1")).toBeUndefined()
    expect(openedThreadIn("[a](/projects/](/projects/p1/sessions/s1)")).toBeUndefined()
  })

  it("takes linear time on text made to make a regular expression backtrack", () => {
    const started = performance.now()
    expect(openedThreadIn("](/projects/".repeat(200_000))).toBeUndefined()
    expect(openedThreadIn(`${"](/projects/".repeat(100_000)} `)).toBeUndefined()
    expect(performance.now() - started).toBeLessThan(1_000)
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
