import { assert, describe, it } from "@effect/vitest"
import {
  expandEnv,
  mcpConfigFromInput,
  mcpServerView,
  parseMcpImport,
  readMcpConfig,
  toAgentMcpServer,
} from "../src/extensions/mcpConfig.ts"
import { parseSkillFile, renderSkillFile } from "../src/extensions/skillFile.ts"

describe("SKILL.md files", () => {
  it("reads plain, quoted and block frontmatter values", () => {
    assert.deepStrictEqual(
      parseSkillFile("---\nname: deploy\ndescription: Ships the app\n---\n\nRun the deploy.\n"),
      { name: "deploy", description: "Ships the app", body: "Run the deploy.\n" },
    )
    assert.strictEqual(
      parseSkillFile('---\nname: a\ndescription: "Use when: \\"x\\" happens"\n---\n').description,
      'Use when: "x" happens',
    )
    assert.strictEqual(
      parseSkillFile("---\nname: a\ndescription: 'it''s fine'\n---\n").description,
      "it's fine",
    )
    assert.strictEqual(
      parseSkillFile("---\nname: a\ndescription: >\n  Folded onto\n  one line.\nother: x\n---\n")
        .description,
      "Folded onto one line.",
    )
    assert.strictEqual(
      parseSkillFile("---\ndescription: Wraps\n  onto the next line\n---\n").description,
      "Wraps onto the next line",
    )
  })

  it("handles CRLF, a BOM and a missing frontmatter", () => {
    assert.deepStrictEqual(
      parseSkillFile("\uFEFF---\r\nname: win\r\ndescription: CRLF\r\n---\r\nBody\r\n"),
      { name: "win", description: "CRLF", body: "Body\n" },
    )
    assert.deepStrictEqual(parseSkillFile("Just instructions"), {
      name: undefined,
      description: undefined,
      body: "Just instructions",
    })
  })

  it("writes a file it reads back, whatever the description holds", () => {
    const skill = {
      name: "review-sql",
      description: 'Checks SQL: "joins", #comments and - dashes',
      instructions: "\r\n# Steps\r\n\r\n1. Read the query.\r\n\r\n",
    }
    const text = renderSkillFile(skill)
    assert.isFalse(text.includes("\r"))
    assert.deepStrictEqual(parseSkillFile(text), {
      name: "review-sql",
      description: skill.description,
      body: "# Steps\n\n1. Read the query.\n",
    })
  })
})

describe("MCP configurations", () => {
  it("reads local and remote servers in Claude Code's format", () => {
    assert.deepStrictEqual(
      readMcpConfig({ command: "npx", args: ["-y", "pkg", 3], env: { A: "1" } }),
      {
        _tag: "stdio",
        command: "npx",
        args: ["-y", "pkg"],
        env: { A: "1" },
      },
    )
    assert.deepStrictEqual(readMcpConfig({ type: "sse", url: "https://x.dev/sse" }), {
      _tag: "sse",
      url: "https://x.dev/sse",
      headers: {},
    })
    assert.strictEqual(readMcpConfig({ url: "https://x.dev/mcp" })?._tag, "http")
    assert.isUndefined(readMcpConfig({ type: "ws", url: "wss://x" }))
    assert.isUndefined(readMcpConfig({ args: [] }))
  })

  it("shows names of variables and headers, never their values", () => {
    const view = mcpServerView(
      "gh",
      { _tag: "http", url: "https://api.dev/mcp", headers: { Authorization: "Bearer secret" } },
      "humanity",
      true,
    )
    assert.deepStrictEqual(view.transport, {
      _tag: "http",
      url: "https://api.dev/mcp",
      headers: ["Authorization"],
    })
    assert.isFalse(JSON.stringify(view).includes("secret"))
  })

  it("keeps a saved value when the human leaves it unchanged", () => {
    const previous = { _tag: "stdio", command: "srv", args: [], env: { TOKEN: "t0k" } } as const
    const kept = mcpConfigFromInput(
      {
        _tag: "stdio",
        command: " srv ",
        args: ["--x"],
        env: [
          { name: "TOKEN", value: null },
          { name: "MODE", value: "fast" },
        ],
      },
      previous,
    )
    assert.deepStrictEqual(kept, {
      config: { _tag: "stdio", command: "srv", args: ["--x"], env: { TOKEN: "t0k", MODE: "fast" } },
    })
    // Nothing saved under that name: the human must enter one.
    assert.deepStrictEqual(
      mcpConfigFromInput(
        { _tag: "http", url: "https://x.dev", headers: [{ name: "X", value: null }] },
        previous,
      ),
      { error: "Enter a value for the header X." },
    )
    assert.deepStrictEqual(
      mcpConfigFromInput(
        {
          _tag: "stdio",
          command: "srv",
          args: [],
          env: [
            { name: "A", value: "1" },
            { name: "A", value: "2" },
          ],
        },
        undefined,
      ),
      { error: "The environment variable A is listed twice." },
    )
  })

  it("imports a pasted configuration, wrapped or not", () => {
    const wrapped = parseMcpImport(
      JSON.stringify({
        mcpServers: { github: { type: "http", url: "https://api.githubcopilot.com/mcp/" } },
      }),
    )
    assert.deepStrictEqual(wrapped, {
      servers: [
        ["github", { _tag: "http", url: "https://api.githubcopilot.com/mcp/", headers: {} }],
      ],
    })
    const bare = parseMcpImport('{ "fs": { "command": "npx", "args": ["-y", "server-fs"] } }')
    assert.isTrue("servers" in bare && bare.servers[0]?.[0] === "fs")
  })

  it("explains what is wrong with a pasted configuration", () => {
    assert.include(errorOf(parseMcpImport("{ nope")), "not valid JSON")
    assert.include(errorOf(parseMcpImport('{ "command": "npx" }')), "Give the server a name")
    assert.include(
      errorOf(parseMcpImport('{ "bad name": { "command": "x" } }')),
      "not a valid server name",
    )
    assert.include(errorOf(parseMcpImport('{ "x": { "args": [] } }')), 'needs a "command"')
    assert.include(errorOf(parseMcpImport('{ "mcpServers": {} }')), "no MCP servers")
  })

  it("expands ${VAR} and ${VAR:-default} for the agent, as Claude Code does", () => {
    const env = { TOKEN: "abc" }
    assert.strictEqual(expandEnv("Bearer ${TOKEN}", env), "Bearer abc")
    assert.strictEqual(expandEnv("${MISSING:-none}", env), "none")
    assert.strictEqual(expandEnv("${MISSING}", env), "${MISSING}")
    assert.deepStrictEqual(
      toAgentMcpServer(
        { _tag: "stdio", command: "srv", args: ["${TOKEN}"], env: { K: "${TOKEN}" } },
        env,
      ),
      { type: "stdio", command: "srv", args: ["abc"], env: { K: "abc" } },
    )
  })
})

const errorOf = (result: { readonly error: string } | object): string =>
  "error" in result && typeof result.error === "string"
    ? result.error
    : assert.fail("expected an error")
