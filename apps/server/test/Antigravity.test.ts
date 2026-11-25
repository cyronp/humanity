import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import type { ToolCallFields } from "../src/acp/protocol.ts"
import {
  antigravityEdit,
  antigravityMcpTool,
  antigravityModelsFromList,
  antigravityProfile,
  antigravitySettingsProblem,
  antigravitySignedIn,
  applyReplacements,
} from "../src/antigravity/Antigravity.ts"

const call = (fields: Partial<ToolCallFields>): ToolCallFields => ({
  toolCallId: "call_1",
  ...fields,
})

const files =
  (contents: Readonly<Record<string, string>>) =>
  (path: string): Effect.Effect<string | undefined> =>
    Effect.succeed(contents[path.replaceAll("\\", "/").replace(/^[A-Za-z]:/, "")])

describe("antigravityModelsFromList", () => {
  it("offers a model once for all the thinking levels it lists", () => {
    const listed = [
      "gemini-4-neon-low       Gemini 4 Neon (Low)",
      "gemini-4-neon-high      Gemini 4 Neon (High)",
      "gemini-4-neon-xhigh     Gemini 4 Neon (XHigh)",
      "gemini-3.8-flash-medium  Gemini 3.8 Flash (Medium)",
      "gemini-pro-orchestrator-neon   Orchestrator (Neon)",
      "",
    ].join("\n")
    assert.deepStrictEqual(antigravityModelsFromList(listed), [
      {
        value: "gemini-4-neon",
        displayName: "Gemini 4 Neon",
        description: "Thinking: low, high, xhigh",
        efforts: ["low", "high", "xhigh"],
      },
      {
        value: "gemini-3.8-flash-medium",
        displayName: "Gemini 3.8 Flash (Medium)",
        description: "",
      },
      {
        value: "gemini-pro-orchestrator-neon",
        displayName: "Orchestrator (Neon)",
        description: "",
      },
    ])
  })

  it("lists nothing when the CLI prints only names", () => {
    assert.deepStrictEqual(antigravityModelsFromList("Claude Opus 5.5 (Low)\nGPT-OSS 120B\n"), [])
  })
})

describe("antigravitySignedIn", () => {
  it("reads a listing as signed in and an authentication error as signed out", () => {
    assert.isTrue(
      antigravitySignedIn({
        exitCode: 0,
        stdout: "gemini-4-neon-low  Gemini 4 Neon (Low)",
        stderr: "",
      }),
    )
    assert.isFalse(
      antigravitySignedIn({ exitCode: 1, stdout: "", stderr: "Error: authentication required" }),
    )
    assert.isUndefined(antigravitySignedIn({ exitCode: 2, stdout: "", stderr: "segfault" }))
  })
})

describe("antigravitySettingsProblem", () => {
  const path = "/home/me/.gemini/antigravity-cli/settings.json"

  it("lets settings through that keep Antigravity asking", () => {
    assert.isUndefined(antigravitySettingsProblem(undefined, path))
    assert.isUndefined(
      antigravitySettingsProblem(
        JSON.stringify({
          agentMode: "accept-edits",
          toolPermission: "request-review",
          permissions: { allow: ["read_file(src/)"], deny: ["command(rm)"] },
        }),
        path,
      ),
    )
  })

  it("names every setting that lets a call run without asking", () => {
    const problem = antigravitySettingsProblem(
      JSON.stringify({
        toolPermission: "always-proceed",
        permissions: { allow: ["command(npm run)", "read_file(docs/)", "mcp(linter/*)"] },
      }),
      path,
    )
    assert.include(problem, '"toolPermission": "always-proceed"')
    assert.include(problem, 'the allow rule "command(npm run)"')
    assert.include(problem, 'the allow rule "mcp(linter/*)"')
    assert.notInclude(problem, "read_file(docs/)")
    assert.include(problem, path)
  })

  it("does not guess at settings it cannot read", () => {
    assert.include(antigravitySettingsProblem("{ // comment", path), "could not read")
  })
})

describe("antigravityMcpTool", () => {
  it("names an MCP call by the server it was given", () => {
    const servers = ["humanity", "my_docs"]
    assert.deepStrictEqual(
      antigravityMcpTool(
        call({ title: "Run mcp_humanity_open_thread?", rawInput: { prompt: "Port it" } }),
        servers,
      ),
      { toolName: "mcp__humanity__open_thread", input: { prompt: "Port it" } },
    )
    assert.strictEqual(
      antigravityMcpTool(call({ title: "Running mcp_my_docs_search_all" }), servers)?.toolName,
      "mcp__my_docs__search_all",
    )
    assert.strictEqual(
      antigravityMcpTool(call({ name: "mcp_humanity_terminal_send" }), servers)?.toolName,
      "mcp__humanity__terminal_send",
    )
    assert.isUndefined(antigravityMcpTool(call({ title: "Run mcp_unknown_tool" }), servers))
    assert.isUndefined(antigravityMcpTool(call({ title: "npm test" }), servers))
  })
})

describe("applyReplacements", () => {
  it("replaces each target where it occurs once, keeping CRLF files CRLF", () => {
    assert.strictEqual(
      applyReplacements("a\r\nb\r\nc\r\n", [{ target: "b\nc", replacement: "B\nC" }]),
      "a\r\nB\r\nC\r\n",
    )
    assert.isUndefined(applyReplacements("x\nx\n", [{ target: "x", replacement: "y" }]))
    assert.isUndefined(applyReplacements("x\n", [{ target: "z", replacement: "y" }]))
  })
})

describe("antigravityEdit", () => {
  const cwd = "/work/repo"
  const read = files({ "/work/repo/src/app.ts": "one\ntwo\nthree\nfour\n" })

  it.effect("places a replaced snippet where it is in the file", () =>
    Effect.gen(function* () {
      const named = yield* antigravityEdit(
        call({
          kind: "edit",
          rawInput: { TargetContent: "three\n", ReplacementContent: "THREE\n" },
          content: [
            { type: "diff", path: "/work/repo/src/app.ts", oldText: "three\n", newText: "THREE\n" },
          ],
        }),
        cwd,
        read,
      )
      assert.deepStrictEqual(named, {
        toolName: "ApplyPatch",
        input: {
          changes: [
            {
              path: "/work/repo/src/app.ts",
              kind: "update",
              diff: "@@ -1,4 +1,4 @@\n one\n two\n-three\n+THREE\n four",
            },
          ],
        },
      })
    }),
  )

  it.effect("shows a written file against what it held, or as a new file", () =>
    Effect.gen(function* () {
      const written = yield* antigravityEdit(
        call({
          kind: "edit",
          rawInput: { TargetFile: "/work/repo/notes.md", CodeContent: "# Notes\n" },
        }),
        cwd,
        read,
      )
      assert.deepStrictEqual(written?.input, {
        changes: [{ path: "/work/repo/notes.md", kind: "add", diff: "# Notes\n" }],
      })
    }),
  )

  it.effect("never reads a file outside the session's folder", () =>
    Effect.gen(function* () {
      const named = yield* antigravityEdit(
        call({
          kind: "edit",
          content: [{ type: "diff", path: "/etc/hosts", oldText: "a\n", newText: "b\n" }],
        }),
        cwd,
        files({ "/etc/hosts": "a\n" }),
      )
      assert.deepStrictEqual(named?.input, {
        changes: [{ path: "/etc/hosts", kind: "update", diff: "@@ -1,1 +1,1 @@\n-a\n+b" }],
      })
    }),
  )

  it.effect("leaves an edit that shows nothing to its own name", () =>
    Effect.gen(function* () {
      assert.isUndefined(yield* antigravityEdit(call({ kind: "edit" }), cwd, read))
    }),
  )
})

describe("antigravityProfile", () => {
  const profile = antigravityProfile(() => Effect.succeed(undefined))({
    cwd: "/work/repo",
    mcpServers: ["humanity"],
    offersOpenThread: false,
  })

  it("holds the session in the mode that asks", () => {
    assert.strictEqual(profile.mode, "default")
    assert.deepStrictEqual(profile.settings, [{ id: "mode", value: "default" }])
  })

  it("treats interaction requests as questions", () => {
    assert.isTrue(profile.question?.(call({ toolCallId: "interaction_7" })))
    assert.isFalse(profile.question?.(call({ toolCallId: "call_7" })))
  })

  it("adds Humanity's instructions only where the agent takes them", () => {
    assert.isUndefined(profile.sessionMeta?.({}))
    const meta = profile.sessionMeta?.({
      agentCapabilities: { _meta: { antigravity: { systemPrompt: { append: true } } } },
    })
    const append = (meta?.["antigravity"] as { systemPrompt: { append: string } }).systemPrompt
      .append
    assert.include(append, "running inside Humanity")
    assert.notInclude(append, "open_thread")
  })
})
